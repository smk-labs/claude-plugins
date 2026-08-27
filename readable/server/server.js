#!/usr/bin/env node
/**
 * readable-card — zero-dependency MCP Apps server (SEP-1865).
 *
 * ONE tool matters: `card`. The model sends only content HTML (readable building
 * blocks, no <style>); the host renders it inside a predeclared ui:// template
 * that carries the kit CSS. Output tokens per reply drop to the content itself.
 * The other seven tools are the card UI's own, called by the iframe through the
 * host and never by the model.
 *
 * This file is WIRING ONLY — method in, module out:
 *
 *   rpc.js        the wire (NDJSON JSON-RPC over stdio, both directions)
 *   host.js       what the client can do; uiReady() gates the card tool
 *   tools.js      the tool registry and its one dispatcher
 *   template.js   the ui:// resource, assembled from kit + theme + bridge + menu
 *   kit.js        assets/rc.css: BASE, per-component snippets, the signature
 *   theme.js      assets/palette.css + assets/ltr.css, adapted for a card
 *   blocks.js     assets/blocks.md: the block vocabulary, per tier
 *   brand.js      a project's .readable layer
 *   files.js      reads and writes on the user's disk
 *   fonts.js      web fonts embedded as bytes, for PNG exports
 *   sys.js        clipboard, locale, parent process, stderr
 *   paths.js      plugin layout vs flat layout, in one place
 *
 * EXPERIMENTAL: needs a host that negotiates the io.modelcontextprotocol/ui
 * extension. Where it is absent the card tool is not offered at all, and a call
 * to it is refused rather than answered — see host.uiReady.
 */
'use strict';
const paths = require('./paths.js');
const rpc = require('./rpc.js');
const host = require('./host.js');
const tools = require('./tools.js');
const template = require('./template.js');
const sys = require('./sys.js');

const PROTOCOL_FALLBACK = '2025-06-18';
const SERVER_INFO = { name: 'readable-card', version: '0.1.0' };
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const RESOURCE_NOT_FOUND = -32002;

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      host.negotiate(params);
      return rpc.respond(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_FALLBACK,
        capabilities: {
          tools: {},
          resources: {},
          extensions: { [host.UI_EXT]: { mimeTypes: [host.UI_MIME] } },
        },
        serverInfo: SERVER_INFO,
      });

    case 'tools/list':
      return rpc.respond(id, { tools: tools.list(host) });

    case 'tools/call':
      try {
        rpc.respond(id, await tools.call(params && params.name, (params && params.arguments) || {}, host));
      } catch (e) {
        rpc.fail(id, e instanceof tools.ProtocolError ? e.code : INVALID_PARAMS, String(e && e.message));
      }
      return;

    case 'resources/list':
      return rpc.respond(id, { resources: [template.resource()] });

    case 'resources/read': {
      if (!params || params.uri !== template.URI) return rpc.fail(id, RESOURCE_NOT_FOUND, 'unknown resource');
      return rpc.respond(id, {
        contents: [{ uri: template.URI, mimeType: template.MIME, text: template.html(), _meta: template.resource()._meta }],
      });
    }

    case 'ping':
      return rpc.respond(id, {});

    case 'notifications/initialized':
    case 'notifications/roots/list_changed':
      return host.refreshRoots(rpc.request);

    default:
      /* Other notifications (cancelled, …) are ignored by design. */
      if (id != null) rpc.fail(id, METHOD_NOT_FOUND, 'method not found: ' + method);
  }
}

sys.log('build ' + paths.version() + ' file=' + __filename);
rpc.listen(handle);
