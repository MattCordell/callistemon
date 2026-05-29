// modules/ai-agent.js — generic tool-using agent loop over the OpenRouter client.
//
// Feature-agnostic: callers supply the system/user prompts, the tool descriptors
// (getTools()), and a toolImpl map { toolName: async (args) => result }. The loop
// calls the model, dispatches any tool_calls, feeds results back, and repeats
// until the model returns a plain answer (or maxIterations is hit). The final
// content is parsed defensively into JSON.

import { chatCompletion } from './openrouter-client.js';

/**
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userMessage
 * @param {Array}  opts.tools          — OpenAI tool descriptors
 * @param {Object} opts.toolImpl       — { name: async (args) => result }
 * @param {string} [opts.model]
 * @param {number} [opts.maxIterations=8]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{finalContent:string, parsed:any, transcript:Array, error?:string}>}
 */
export async function runAgent({
  systemPrompt, userMessage, tools, toolImpl = {}, model, maxIterations = 8, signal,
} = {}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  for (let i = 0; i < maxIterations; i++) {
    throwIfAborted(signal);

    const resp = await chatCompletion({ model, messages, tools, signal });
    const choice = resp && resp.choices && resp.choices[0];
    const msg = choice && choice.message;
    if (!msg) {
      return { finalContent: '', parsed: null, transcript: messages, error: 'No message in model response' };
    }

    // Push the assistant turn verbatim (carries tool_calls / content).
    messages.push(msg);

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (toolCalls.length) {
      for (const tc of toolCalls) {
        throwIfAborted(signal);
        const name = tc.function && tc.function.name;
        let args = {};
        try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); }
        catch (_e) { args = {}; }

        let result;
        try {
          const impl = toolImpl[name];
          result = impl ? await impl(args) : { error: 'Unknown tool: ' + name };
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
          result = { error: String((e && e.message) || e) };
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue; // let the model consume the tool results
    }

    // No tool calls -> this is the final answer.
    const finalContent = msg.content || '';
    return { finalContent, parsed: extractJson(finalContent), transcript: messages };
  }

  return {
    finalContent: '', parsed: null, transcript: messages,
    error: 'Agent did not produce a final answer within ' + maxIterations + ' iterations',
  };
}

/**
 * Defensive JSON extraction from a model's text output:
 *   1. strict JSON.parse
 *   2. ```json … ``` (or bare ```) fenced block
 *   3. first balanced {…} or […] (string/escape aware)
 * Returns the parsed value, or null if nothing parses.
 */
export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;

  // 1. strict
  try { return JSON.parse(text); } catch (_e) { /* continue */ }

  // 2. fenced code block
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    try { return JSON.parse(fence[1].trim()); } catch (_e) { /* continue */ }
  }

  // 3. balanced bracket extraction — try whichever bracket type appears first
  const candidates = [];
  const obj = text.indexOf('{');
  const arr = text.indexOf('[');
  if (obj >= 0) candidates.push({ at: obj, open: '{', close: '}' });
  if (arr >= 0) candidates.push({ at: arr, open: '[', close: ']' });
  candidates.sort((a, b) => a.at - b.at);
  for (const c of candidates) {
    const sub = balancedSlice(text, c.at, c.open, c.close);
    if (sub) {
      try { return JSON.parse(sub); } catch (_e) { /* try next */ }
    }
  }
  return null;
}

// Return the substring from `start` to the matching close bracket, honouring
// string literals and escapes so brackets inside strings don't miscount.
function balancedSlice(text, start, open, close) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    throw e;
  }
}
