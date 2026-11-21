package `in`.samtravels.app

import org.junit.Assert.assertTrue

internal object AdminEntryPathAuditTestSupport {
    fun setInPanel(
        activity: MainActivity, support: AdminFormsCapacitorAcceptanceTest,
        selector: String, heading: String, label: String, value: String,
    ) {
        val h = heading.replace("'", "\\'")
        val l = label.replace("'", "\\'")
        val v = value.replace("'", "\\'")
        val ready = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');return !!p&&[...p.querySelectorAll('label')].some(n=>n.textContent.trim().startsWith('$l'))})()"""
        assertTrue("Missing field $label in $heading", support.await(activity, ready, 15000))
        val script = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');const l=[...p.querySelectorAll('label')].find(n=>n.textContent.trim().startsWith('$l'));const c=l?.querySelector('input,select,textarea');if(!c)return false;const q=c instanceof HTMLSelectElement?HTMLSelectElement.prototype:c instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(q,'value').set.call(c,'$v');c.dispatchEvent(new Event(c instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()"""
        check(support.javascriptValue(activity, script) == "true") { "Could not set $label in $heading" }
    }

    fun clickInPanel(
        activity: MainActivity, support: AdminFormsCapacitorAcceptanceTest,
        selector: String, heading: String, button: String,
    ) {
        val h = heading.replace("'", "\\'")
        val b = button.replace("'", "\\'")
        val ready = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');return !!p&&[...p.querySelectorAll('button')].some(n=>n.textContent.trim()==='$b'&&!n.disabled)})()"""
        assertTrue("Missing action $button in $heading", support.await(activity, ready, 15000))
        val script = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');const b=[...p.querySelectorAll('button')].find(n=>n.textContent.trim()==='$b'&&!n.disabled);if(!b)return false;b.click();return true})()"""
        check(support.javascriptValue(activity, script) == "true") { "Could not click $button in $heading" }
    }
}
