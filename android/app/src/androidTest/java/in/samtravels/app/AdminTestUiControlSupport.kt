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
        // A label's textContent includes the selected <option> text. Matching
        // that combined string can accidentally target a different field (for
        // example, a historical inactive Driver option) when labels overlap.
        // Match the label's own text nodes and, for selects, the exact option.
        val ready = """(() => {
            const labelText = n => {
                const clone = n.cloneNode(true);
                clone.querySelectorAll('input,select,textarea').forEach(control => control.remove());
                return (clone.textContent || '').replace(/\s+/g, ' ').trim();
            };
            const labels = [...document.querySelectorAll('label')]
                .filter(n => labelText(n).includes('$name'));
            return labels.some(n => {
                const c = n.querySelector('select,input,textarea');
                return c instanceof HTMLSelectElement
                    ? [...c.options].some(o => o.value === '$text')
                    : Boolean(c);
            });
        })()"""
        assertTrue("Admin field/options load: " + label, await(ready, 15000))
        val js = """(() => {
            const labelText = n => {
                const clone = n.cloneNode(true);
                clone.querySelectorAll('input,select,textarea').forEach(control => control.remove());
                return (clone.textContent || '').replace(/\s+/g, ' ').trim();
            };
            let labels = [...document.querySelectorAll('label')]
                .filter(n => labelText(n).trim() === '$name');
            if (!labels.length) labels = [...document.querySelectorAll('label')]
                .filter(n => labelText(n).includes('$name'));
            labels = labels.filter(n => {
                const c = n.querySelector('select,input,textarea');
                return c instanceof HTMLSelectElement
                    ? [...c.options].some(o => o.value === '$text')
                    : Boolean(c);
            });
            const n = labels[$index];
            const c = n?.querySelector('select,input,textarea');
            if (!c) return false;
            const p = c instanceof HTMLSelectElement ? HTMLSelectElement.prototype
                : c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(p, 'value').set.call(c, '$text');
            c.dispatchEvent(new Event(c instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
            return true;
        })()"""
        check(javascriptValue(js) == "true") { "Missing Admin field: " + label + "; page=" + javascriptValue("document.body.innerText") }
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
