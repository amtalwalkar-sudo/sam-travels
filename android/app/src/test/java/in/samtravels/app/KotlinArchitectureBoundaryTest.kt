package in.samtravels.app

import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.com.intellij.psi.PsiElement
import org.jetbrains.kotlin.com.intellij.psi.PsiRecursiveElementWalkingVisitor
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtPsiFactory
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid
import org.jetbrains.kotlin.psi.KtNameReferenceExpression
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
    private fun parse(source: String): KtFile {
        val disposable = Disposer.newDisposable()
        try {
            val environment = KotlinCoreEnvironment.createForProduction(
                disposable,
                CompilerConfiguration(),
                EnvironmentConfigFiles.JVM_CONFIG_FILES,
            )
            return KtPsiFactory(environment.project).createFile("ArchitectureFixture.kt", source)
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
        val file = parse(
            """
            // database.records()
            val note = "database.logBookEvents()"
            fun read(database: LocalDatabase) = database.records().list()
            """.trimIndent(),
        )
        assertEquals(listOf("records", "list"), callNames(file))
    }

    @Test
    fun productionRoomDaoCallsStayInsideApprovedGateways() {
        val root = findRepositoryRoot()
        val allowed = setOf(
            "android/app/src/main/java/in/samtravels/app/LocalDatabase.kt",
            "android/app/src/main/java/in/samtravels/app/DriverWorkflowStore.kt",
            "android/app/src/main/java/in/samtravels/app/RoomStorePlugin.kt",
            "android/app/src/main/java/in/samtravels/app/BackupPlugin.kt",
            "android/app/src/main/java/in/samtravels/app/DailyDropboxBackupWorker.kt",
            "android/app/src/main/java/in/samtravels/app/NativeBackupCoverage.kt",
        )
        val violations = mutableListOf<String>()
        val sourceRoot = File(root, "android/app/src/main")
        sourceRoot.walkTopDown().filter { it.isFile && it.extension == "kt" }.forEach { source ->
            val relative = source.relativeTo(root).invariantSeparatorsPath
            val file = parse(source.readText())
            file.accept(object : KtTreeVisitorVoid() {
                override fun visitCallExpression(expression: KtCallExpression) {
                    val name = expression.calleeExpression?.text
                    if (name in setOf("records", "logBookEvents") && relative !in allowed) {
                        violations += "$relative: direct Room DAO call '$name' outside an approved gateway"
                    }
                    super.visitCallExpression(expression)
                }
            })
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
