package `in`.samtravels.app

/** DOM controls used by the Admin acceptance journeys; waits for async select options before setting. */
internal object AdminTestUiControlSupport {
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

    /** Retires the one seeded demo vehicle so a test can configure its own active vehicle. */
    fun retireProfileVehicle(
        setField: (String, String) -> Unit,
        clickAction: (String) -> Unit,
        evaluate: (String) -> Unit,
        awaitCondition: (String, Long) -> Boolean,
    ) {
        evaluate("""(()=>{const card=[...document.querySelectorAll('#admin-section-panel-vehicle .admin-capability-record')].find(n=>n.textContent.includes('MH01EM7360'));card?.querySelector('button')?.click();return Boolean(card)})()""")
        setField("Lifecycle status", "inactive")
        clickAction("Save vehicle")
        check(awaitCondition("document.body.innerText.includes('Vehicle details updated.')", 15000)) {
            "Seed vehicle retirement did not complete"
        }
        evaluate("document.getElementById('admin-section-trigger-driver')?.click()")
        evaluate("""(()=>{const card=[...document.querySelectorAll('#admin-section-panel-driver .admin-capability-record')].find(n=>n.textContent.includes('Ashwinikumar Talwalkar'));card?.querySelector('button')?.click();return Boolean(card)})()""")
        setField("Status", "inactive")
        clickAction("Save driver")
        check(awaitCondition("document.body.innerText.includes('Driver updated.')", 15000)) {
            "Seed driver retirement did not complete"
        }
        evaluate("document.getElementById('admin-section-trigger-vehicle')?.click()")
    }
}
