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
        "android/app/src/main/java/in/samtravels/app/DriverWorkflowIdentity.kt",
        "android/app/src/main/java/in/samtravels/app/DriverWorkflowOutbox.kt",
        "android/app/src/main/java/in/samtravels/app/DriverCancellationFeeStore.kt",
        "android/app/src/main/java/in/samtravels/app/WorkDriverContextResolver.kt",
        "android/app/src/main/java/in/samtravels/app/RoomStorePlugin.kt",
        "android/app/src/main/java/in/samtravels/app/BackupPlugin.kt",
        "android/app/src/main/java/in/samtravels/app/DailyDropboxBackupWorker.kt",
        "android/app/src/main/java/in/samtravels/app/TimelineEnrichmentStore.kt",
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
    @Test
    fun overlayLocationRequestLifecycleIsConfinedToMainThread() {
        val root = findRepositoryRoot()
        val source = File(root, "android/app/src/main/java/in/samtravels/app/DriverOverlayService.kt").readText()
        assertTrue("Background callers must marshal location acquisition to main", source.contains(
            "if(Looper.myLooper()!=Looper.getMainLooper()){"
        ))
        assertTrue("Posted acquisition must not run after service destruction", source.contains(
            "main.post{if(!serviceDestroyed)acquireLocationOnMain(id,command,intent)}"
        ))
        assertTrue("The service must request platform location through its main-thread boundary", source.contains(
            "locationSource.requestLocationUpdates(provider,listener,Looper.getMainLooper())"
        ))
        val locationSource = File(root, "android/app/src/main/java/in/samtravels/app/DriverOverlayRuntimeFactories.kt").readText()
        assertTrue("The platform adapter must forward the supplied main looper to LocationManager", locationSource.contains(
            "manager.requestLocationUpdates(provider, 0L, 0f, listener, looper)"
        ))
        assertTrue("Service completion must unregister the active location listener", source.contains(
            "locationSource.removeUpdates(listener)"
        ))
        assertTrue("Location completion must remain on main", source.contains(
            "location_finish_must_run_on_main_thread"
        ))
        assertTrue("Service teardown must be main-thread-owned", source.contains(
            "service_destroy_must_run_on_main_thread"
        ))
        assertTrue("Database completion must remain delegated to the executor", source.contains(
            "private fun complete(id:String,command:JSONObject,intent:JSONObject,location:Location){\n  executor.execute"
        ))
    }

    @Test
    fun overlayServiceDelegatesAllWindowAndViewOwnershipToPresentationAdapter() {
        val root = findRepositoryRoot()
        val source = File(root, "android/app/src/main/java/in/samtravels/app/DriverOverlayService.kt").readText()
        val forbiddenPresentationOwnership = listOf(
            "WindowManager",
            "android.view",
            "android.widget",
            "setOnTouchListener",
            "addView(",
            "removeView(",
            "LinearLayout(",
            "TextView(",
            "SeekBar(",
        )
        val violations = forbiddenPresentationOwnership.filter { source.contains(it) }
        assertTrue(
            "DriverOverlayService must delegate disposable overlay UI to DriverOverlayPresentation: $violations",
            violations.isEmpty(),
        )
        assertTrue(
            "Service must retain its presentation adapter boundary",
            source.contains("DriverOverlayPresentation(") || source.contains("DriverOverlayPresentation"),
        )
    }

}
