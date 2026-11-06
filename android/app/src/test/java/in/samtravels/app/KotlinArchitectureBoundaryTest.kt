package `in`.samtravels.app

import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtPsiFactory
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Kotlin compiler PSI-backed ownership checks. These tests inspect Kotlin syntax
 * trees, not source text, so comments and string literals cannot spoof or evade
 * the persistence-call checks.
 */
class KotlinArchitectureBoundaryTest {
    private fun <T> withParsed(source: String, inspect: (KtFile) -> T): T {
        val disposable = Disposer.newDisposable()
        try {
            val environment = KotlinCoreEnvironment.createForProduction(
                disposable,
                CompilerConfiguration(),
                EnvironmentConfigFiles.JVM_CONFIG_FILES,
            )
            val file = KtPsiFactory(environment.project).createFile("ArchitectureFixture.kt", source)
            return inspect(file)
        } finally {
            Disposer.dispose(disposable)
        }
    }

    private fun callNames(file: KtFile): List<String> {
        val names = mutableListOf<String>()
        file.accept(object : KtTreeVisitorVoid() {
            override fun visitCallExpression(expression: KtCallExpression) {
                expression.calleeExpression?.text?.let(names::add)
                super.visitCallExpression(expression)
            }
        })
        return names
    }

    @Test
    fun kotlinPsiFindsRoomDaoCallsButIgnoresCommentsAndStrings() {
        withParsed(
            """
            // database.records()
            val note = "database.logBookEvents()"
            fun read(database: LocalDatabase) = database.records().list()
            """.trimIndent(),
        ) { file ->
            assertEquals(listOf("records", "list"), callNames(file))
        }
    }

    private val approvedRoomGateways = setOf(
        "android/app/src/main/java/in/samtravels/app/LocalDatabase.kt",
        "android/app/src/main/java/in/samtravels/app/DriverWorkflowStore.kt",
        "android/app/src/main/java/in/samtravels/app/RoomStorePlugin.kt",
        "android/app/src/main/java/in/samtravels/app/BackupPlugin.kt",
        "android/app/src/main/java/in/samtravels/app/DailyDropboxBackupWorker.kt",
        "android/app/src/main/java/in/samtravels/app/NativeBackupCoverage.kt",
        "android/app/src/main/java/in/samtravels/app/NativeFeatureBackupParticipants.kt",
    )

    private fun roomDaoViolations(source: String, relative: String): List<String> =
        withParsed(source) { file ->
            val violations = mutableListOf<String>()
            file.accept(object : KtTreeVisitorVoid() {
                override fun visitCallExpression(expression: KtCallExpression) {
                    val name = expression.calleeExpression?.text
                    if (name in setOf("records", "logBookEvents") && relative !in approvedRoomGateways) {
                        violations += "$relative: direct Room database accessor '$name' outside an approved gateway"
                    }
                    if (name in setOf("execSQL", "compileStatement", "rawQuery") && relative !in approvedRoomGateways) {
                        violations += "$relative: direct SQLite operation '$name' outside an approved gateway"
                    }
                    super.visitCallExpression(expression)
                }
            })
            violations
        }

    @Test
    fun authorizedGatewayFixtureAllowsRoomDaoCalls() {
        val source = """
            fun write(database: LocalDatabase, record: StoredRecord) {
                database.records().put(record)
                database.logBookEvents().clear()
                database.execSQL("DELETE FROM records")
            }
        """.trimIndent()
        assertTrue(roomDaoViolations(
            source,
            "android/app/src/main/java/in/samtravels/app/DriverWorkflowStore.kt",
        ).isEmpty())
    }

    @Test
    fun unauthorizedFixtureRejectsRoomReadsAndWrites() {
        val source = """
            fun write(database: LocalDatabase, record: StoredRecord) {
                database.records().put(record)
                database.records().remove(record.id)
                database.logBookEvents().clear()
                database.execSQL("DELETE FROM records")
            }
        """.trimIndent()
        assertEquals(
            listOf(
                "packages/application/src/unsafe.kt: direct Room database accessor 'records' outside an approved gateway",
                "packages/application/src/unsafe.kt: direct Room database accessor 'records' outside an approved gateway",
                "packages/application/src/unsafe.kt: direct Room database accessor 'logBookEvents' outside an approved gateway",
                "packages/application/src/unsafe.kt: direct SQLite operation 'execSQL' outside an approved gateway",
            ),
            roomDaoViolations(source, "packages/application/src/unsafe.kt"),
        )
    }

    @Test
    fun productionRoomDaoCallsStayInsideApprovedGateways() {
        val root = findRepositoryRoot()
        val violations = mutableListOf<String>()
        val sourceRoot = File(root, "android/app/src/main")
        sourceRoot.walkTopDown().filter { it.isFile && it.extension == "kt" }.forEach { source ->
            val relative = source.relativeTo(root).path.replace(File.separatorChar, '/')
            violations += roomDaoViolations(source.readText(), relative)
        }
        assertTrue(violations.joinToString("\n"), violations.isEmpty())
    }

    private fun findRepositoryRoot(): File {
        var candidate = File(System.getProperty("user.dir")).canonicalFile
        while (candidate.parentFile != null) {
            if (File(candidate, "docs/ARCHITECTURE_FOUNDATION_CONTRACT.md").isFile &&
                File(candidate, "android/app/src/main").isDirectory
            ) return candidate
            candidate = candidate.parentFile
        }
        error("Could not locate Sam Travels repository root from ${System.getProperty("user.dir")}")
    }
}
