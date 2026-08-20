pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Scope {
  id: root

  readonly property int protocolVersion: 1
  readonly property string brokerPath: {
    var url = String(Qt.resolvedUrl("../runtime/dist/omadigest-broker.mjs"))
    if (url.indexOf("file://") === 0) {
      try { return decodeURIComponent(url.slice(7)) }
      catch (error) { return url.slice(7) }
    }
    return url
  }

  property bool ready: false
  property string state: "starting"
  property string status: "Starting OmaDigest…"
  property var templates: []
  property var integrations: []
  property var integrationSetup: ({})
  property var selection: null
  property var draft: null
  property string draftId: ""
  property string draftKind: "template"
  property string draftState: "idle"
  property var digest: null
  property var digestHistory: []
  property string digestState: "idle"
  property int attentionCount: 0
  property bool dictationAvailable: false
  property string dictationState: "idle"
  property string transcript: ""
  property var tts: ({ configured: false, state: "idle", config: null })
  property string errorMessage: ""
  property int nextId: 1

  function send(command) {
    if (!broker.running) return
    broker.write(JSON.stringify(command) + "\n")
  }

  function startDraft(kind, request) {
    var text = String(request || "").trim()
    if (!text) return
    draftKind = kind === "integration" ? "integration" : "template"
    draftState = "working"
    draft = null
    send({ type: "draft_start", id: "draft-" + nextId++, kind: draftKind, request: text })
  }

  function acceptDraft() {
    if (!draftId) return
    send({ type: "draft_accept", id: "accept-" + nextId++, draftId: draftId })
  }

  function rejectDraft() {
    if (!draftId) return
    send({ type: "draft_reject", id: "reject-" + nextId++, draftId: draftId })
    draft = null
    draftId = ""
    draftState = "idle"
  }

  function handoffDefaultAgent(prompt) {
    send({ type: "handoff_default_agent", id: "handoff-" + nextId++, prompt: String(prompt || "") })
  }

  function requestDictationStatus() {
    send({ type: "dictation_status", id: "dictation-" + nextId++ })
  }

  function toggleDictation() {
    var type = dictationState === "recording" ? "dictation_stop" : "dictation_start"
    if (type === "dictation_start") transcript = ""
    send({ type: type, id: "dictation-" + nextId++ })
  }

  function cancelDictation() {
    send({ type: "dictation_cancel", id: "dictation-" + nextId++ })
  }

  function ingest(items) {
    send({ type: "attention_ingest", id: "attention-" + nextId++, items: items || [] })
  }

  function requestDigestHistory() { send({ type: "digest_history", id: "history-" + nextId++ }) }
  function deleteDigest(digestId) { send({ type: "digest_delete", id: "history-" + nextId++, digestId: String(digestId) }) }
  function clearDigests() { send({ type: "digest_clear", id: "history-" + nextId++ }) }

  function openDigestFromHistory(saved) {
    if (!saved) return
    digest = saved
    digestState = "ready"
  }

  function generateDigest(context, templateId) {
    digestState = "working"
    digest = null
    var command = { type: "digest_generate", id: "digest-" + nextId++, context: context }
    if (templateId) command.templateId = String(templateId)
    send(command)
  }

  function configureTts(provider, endpoint, model, voice, speed, apiKey) {
    send({
      type: "tts_configure",
      id: "tts-" + nextId++,
      config: {
        provider: String(provider), endpoint: String(endpoint), model: String(model),
        voice: String(voice), speed: Number(speed) || 1
      },
      apiKey: String(apiKey)
    })
  }

  function readDigest() {
    if (!digest) return
    var text = String(digest.title || "")
    var sections = digest.sections || []
    for (var i = 0; i < sections.length; i++) {
      text += ". " + String(sections[i].title || "")
      var entries = sections[i].entries || []
      for (var j = 0; j < entries.length; j++)
        text += ". " + String(entries[j].headline || "") + ". " + String(entries[j].explanation || "")
    }
    send({ type: "tts_speak", id: "tts-" + nextId++, text: text })
  }

  function pauseReadMode() { send({ type: "tts_pause", id: "tts-" + nextId++ }) }
  function stopReadMode() { send({ type: "tts_stop", id: "tts-" + nextId++ }) }
  function requestTtsStatus() { send({ type: "tts_status", id: "tts-" + nextId++ }) }

  function setupIntegration(integrationId, values) {
    send({
      type: "integration_setup",
      id: "setup-" + nextId++,
      integrationId: String(integrationId),
      values: values || {}
    })
  }

  function setIntegrationEnabled(integrationId, enabled) {
    var id = "integration-" + nextId++
    send({
      type: "integration_set_enabled",
      id: id,
      integrationId: String(integrationId),
      enabled: enabled === true
    })
  }

  function selectTemplate(trigger, itemCount, focusMinutes, appCounts, connectors) {
    var id = "route-" + nextId++
    state = "routing"
    status = "Selecting a digest template…"
    send({
      type: "select_template",
      id: id,
      context: {
        trigger: trigger,
        itemCount: Math.max(0, Number(itemCount) || 0),
        focusMinutes: Math.max(0, Number(focusMinutes) || 0),
        appCounts: appCounts || {},
        availableConnectors: connectors || ["notifications"],
        now: new Date().toISOString()
      }
    })
  }

  function applyEvent(event) {
    if (event.type === "ready") {
      ready = true
      state = "ready"
      status = "Ready to build a briefing"
      templates = event.templates || []
      integrations = event.integrations || []
      root.requestDictationStatus()
      root.requestTtsStatus()
      root.requestDigestHistory()
      return
    }
    if (event.type === "draft_state") {
      draftState = "working"
      status = "Drafting " + draftKind + "…"
      return
    }
    if (event.type === "draft") {
      draft = event.draft || null
      draftId = String(event.id || "")
      draftState = "ready"
      status = draft && draft.kind === "out-of-scope" ? "This belongs in the default agent"
        : draft && draft.kind === "clarification" ? "The drafting agent needs one detail"
        : "Draft ready for review"
      return
    }
    if (event.type === "draft_saved") {
      draft = null
      draftId = ""
      draftState = "saved"
      status = event.kind === "integration" ? "Integration installed disabled" : "Template saved"
      return
    }
    if (event.type === "dictation") {
      dictationAvailable = event.available === true
      dictationState = String(event.state || "idle")
      if (dictationState === "recording") status = "Listening…"
      else if (dictationState === "transcribing") status = "Transcribing…"
      else if (event.transcript) status = "Dictation ready"
      if (event.transcript) transcript = String(event.transcript)
      return
    }
    if (event.type === "attention") {
      attentionCount = Number(event.count || 0)
      return
    }
    if (event.type === "digest_state") {
      digestState = "working"
      status = "Building your digest…"
      return
    }
    if (event.type === "digest") {
      digest = event.digest || null
      digestState = "ready"
      root.requestDigestHistory()
      status = "Digest ready"
      return
    }
    if (event.type === "digest_history") {
      digestHistory = event.digests || []
      return
    }
    if (event.type === "tts") {
      tts = { configured: event.configured === true, state: String(event.state || "idle"), config: event.config || null }
      if (tts.state === "playing") status = "Reading digest…"
      else if (tts.state === "paused") status = "Read mode paused"
      return
    }
    if (event.type === "handoff") {
      status = "Opened in the default agent"
      return
    }
    if (event.type === "integration_setup") {
      var nextSetup = Object.assign({}, integrationSetup)
      nextSetup[String(event.integrationId)] = { ready: event.ready === true, message: String(event.message || "") }
      integrationSetup = nextSetup
      status = String(event.message || (event.ready ? "Integration ready" : "Integration setup failed"))
      return
    }
    if (event.type === "integrations") {
      integrations = event.integrations || []
      status = "Integration settings saved"
      return
    }
    if (event.type === "template_selected") {
      selection = event.selection || null
      state = "ready"
      status = selection ? "Selected " + selection.name : "Template selected"
      return
    }
    if (event.type === "error") {
      state = String(event.code || "") === "protocol_mismatch" ? "error" : "ready"
      if (String(event.id || "").indexOf("draft-") === 0) draftState = "error"
      if (String(event.id || "").indexOf("digest-") === 0) digestState = "error"
      errorMessage = String(event.message || "OmaDigest encountered an error.")
      status = errorMessage
    }
  }

  Timer {
    interval: 1000
    running: root.tts.state === "playing" || root.tts.state === "paused"
    repeat: true
    onTriggered: root.requestTtsStatus()
  }

  Process {
    id: broker
    command: [root.brokerPath]
    stdinEnabled: true
    running: true

    onStarted: root.send({ type: "initialize", protocolVersion: root.protocolVersion })
    onExited: function(exitCode, exitStatus) {
      root.ready = false
      root.state = "error"
      root.status = "OmaDigest broker stopped"
    }

    stdout: SplitParser {
      onRead: function(line) {
        try { root.applyEvent(JSON.parse(line)) }
        catch (error) { console.warn("omadigest: invalid broker event") }
      }
    }

    stderr: SplitParser {
      onRead: function(line) {
        var message = String(line || "").trim()
        if (message) console.warn("omadigest: " + message)
      }
    }
  }
}
