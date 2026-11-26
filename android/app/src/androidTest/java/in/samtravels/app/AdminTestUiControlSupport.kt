package `in`.samtravels.app

import org.json.JSONObject

/** DOM controls used by the Admin acceptance journeys; waits for async select options before setting. */
internal object AdminTestUiControlSupport {
    fun resetDriverStateToIdle(database: LocalDatabase, now: String) {
        val idle = JSONObject().put("schemaVersion", 1).put("revision", 1).put("state", "idle")
        val value = JSONObject().put("value", idle)
        database.records().put(StoredRecord("driver-state", value.toString(), 1, now))
    }

    fun set(
        activity: MainActivity,
        label: String,
        value: String,
        index: Int = 0,
        await: (String, Long) -> Boolean,
        javascriptValue: (String) -> String?,
    ) {
        val name = label.replace("'", "\\'")
        val text = value.replace("'", "\\'")
        val ready = """[...document.querySelectorAll('label')].some(n=>n.textContent.includes('$name')&&(()=>{const c=n.querySelector('select');return !c||[...c.options].some(o=>o.value==='$text')})())"""
        assertTrue("Admin field/options load: " + label, await(ready, 15000))
        val js = """(()=>{let a=[...document.querySelectorAll('label')].filter(n=>n.textContent.trim()==='$name');if(!a.length)a=[...document.querySelectorAll('label')].filter(n=>n.textContent.includes('$name'));const c=a[$index]?.querySelector('input,select,textarea');if(!c)return false;const p=c instanceof HTMLSelectElement?HTMLSelectElement.prototype:c instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(c,'$text');c.dispatchEvent(new Event(c instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()"""
        check(javascriptValue(js) == "true") { "Missing Admin field: " + label }
    }

    private fun assertTrue(message: String, condition: Boolean) {
        if (!condition) throw AssertionError(message)
    }

    /** Retires any active operating profiles; tests must not depend on a particular demo seed identity. */
    fun retireProfileVehicle(
        setField: (String, String) -> Unit,
        clickAction: (String) -> Unit,
        evaluate: (String) -> Unit,
        awaitCondition: (String, Long) -> Boolean,
    ) {
        val activeVehicle = """Array.from(document.querySelectorAll('#admin-section-panel-vehicle .admin-capability-record')).some(card => card.querySelector('.admin-capability-record-actions span')?.textContent.trim() === 'active')"""
        while (awaitCondition(activeVehicle, 1000)) {
            evaluate("""(()=>{const card=[...document.querySelectorAll('#admin-section-panel-vehicle .admin-capability-record')].find(n=>n.querySelector('.admin-capability-record-actions span')?.textContent.trim()==='active');const edit=[...card?.querySelectorAll('button')??[]].find(b=>b.textContent.trim()==='Edit');edit?.click();return Boolean(edit)})()""")
            setField("Lifecycle status", "inactive")
            clickAction("Save vehicle")
            check(awaitCondition("!(" + activeVehicle + ")", 15000)) {
                "Active Vehicle retirement did not complete"
            }
        }
        evaluate("document.getElementById('admin-section-trigger-driver')?.click()")
        val activeDriver = """Array.from(document.querySelectorAll('#admin-section-panel-driver .admin-capability-record')).some(card => [...card.querySelectorAll('small')].some(node => / · active(?: ·|$)/.test(node.textContent)))"""
        while (awaitCondition(activeDriver, 1000)) {
            evaluate("""(()=>{const card=[...document.querySelectorAll('#admin-section-panel-driver .admin-capability-record')].find(n=>[...n.querySelectorAll('small')].some(x=>/ · active(?: ·|$)/.test(x.textContent)));const edit=[...card?.querySelectorAll('button')??[]].find(b=>b.textContent.trim()==='Edit');edit?.click();return Boolean(edit)})()""")
            setField("Status", "inactive")
            clickAction("Save driver")
            check(awaitCondition("!(" + activeDriver + ")", 15000)) {
                "Active Driver retirement did not complete"
            }
        }
        evaluate("document.getElementById('admin-section-trigger-vehicle')?.click()")
    }
}
