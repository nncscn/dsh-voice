window.__ModuleLoader__.load({
  id: '@nncs/dsh-voice',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    let createPortal = null;
    try {
      const reactDom = require('react-dom');
      if (reactDom && typeof reactDom.createPortal === 'function') {
        createPortal = reactDom.createPortal.bind(reactDom);
      }
    } catch (error) {
      createPortal = null;
    }

    const NS = '@nncs/dsh-voice';

    const ENDPOINT = '';
    const API_KEY = '';
    const LANGUAGE = 'Chinese';

    const SAMPLE_RATE = 16000;
    const MAX_SECONDS = 60;
    const MIN_SECONDS = 0.4;

    const SETTINGS_KEY = 'asr-voice-button.settings.v2';
    const DEFAULT_SETTINGS = {
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      language: LANGUAGE,
      model: '',
      protocol: 'openai',
      authHeader: '',
      responsePath: '',
    };

    const PROTOCOLS = ['openai', 'azure', 'json'];

    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return Object.assign({}, DEFAULT_SETTINGS, parsed && typeof parsed === 'object' ? parsed : {});
      } catch (error) {
        return Object.assign({}, DEFAULT_SETTINGS);
      }
    }

    function persistSettings(next) {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch (error) {

      }
    }

    function resolveEndpoint(raw) {
      const value = String(raw || '').trim();
      if (!value) return '';
      const withScheme = /^https?:\/\//i.test(value) ? value : 'http://' + value;
      try {
        const url = new URL(withScheme);
        const path = url.pathname.replace(/\/+$/, '');
        if (path === '' || path === '/') url.pathname = '/v1/audio/transcriptions';
        else if (path === '/v1' || path === '/api/v1') url.pathname = path + '/audio/transcriptions';
        return url.toString();
      } catch (error) {
        return value;
      }
    }

    function resolveEndpointFor(settings) {
      const raw = String(settings.endpoint || '').trim();
      if (!raw) return '';
      if (settings.protocol === 'azure') {
        return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      }
      return resolveEndpoint(raw);
    }

    function buildHeaders(settings, extra) {
      const headers = Object.assign({}, extra || {});
      const key = String(settings.apiKey || '').trim();
      if (!key) return headers;
      if (settings.protocol === 'azure') {
        headers['api-key'] = key;
        return headers;
      }
      const custom = String(settings.authHeader || '').trim();
      if (custom) {
        headers[custom] = custom.toLowerCase() === 'authorization' ? 'Bearer ' + key : key;
        return headers;
      }
      headers.Authorization = 'Bearer ' + key;
      return headers;
    }

    function extractText(payload, path) {
      if (!payload || typeof payload !== 'object') return '';
      const walk = (obj, keyPath) => {
        let cur = obj;
        for (const part of String(keyPath).split('.')) {
          if (cur == null || typeof cur !== 'object') return undefined;
          cur = cur[part];
        }
        return cur;
      };
      const custom = String(path || '').trim();
      if (custom) {
        const value = walk(payload, custom);
        if (typeof value === 'string' && value.trim()) return value;
      }
      const fallbacks = ['text', 'result', 'transcript', 'output_text', 'data.text', 'data.result', 'result.text'];
      for (const key of fallbacks) {
        const value = walk(payload, key);
        if (typeof value === 'string' && value.trim()) return value;
      }
      if (Array.isArray(payload.segments) && payload.segments.length) {
        return payload.segments.map((segment) => (segment && segment.text) || '').join('');
      }
      return '';
    }

    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.slice(result.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }

    async function buildRequest(settings, blob, filename) {
      const url = resolveEndpointFor(settings);
      if (settings.protocol === 'json') {
        const base64 = await blobToBase64(blob);
        return {
          url: url,
          init: {
            method: 'POST',
            headers: buildHeaders(settings, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              audio: base64,
              audio_base64: base64,
              language: settings.language || LANGUAGE,
              model: settings.model || undefined,
              response_format: 'json',
            }),
          },
        };
      }
      const form = new FormData();
      form.append('file', blob, filename || 'speech.wav');
      form.append('language', settings.language || LANGUAGE);
      form.append('response_format', 'json');
      if (settings.model) form.append('model', settings.model);
      return { url: url, init: { method: 'POST', headers: buildHeaders(settings), body: form } };
    }

    function silentWav(seconds) {
      const frames = Math.max(1600, Math.floor(16000 * (seconds || 0.5)));
      return encodeWav([new Float32Array(frames)], 16000);
    }

    const SURROUNDING_QUOTES = /^[\s"'“”‘’「」『』]+|[\s"'“”‘’「」『』]+$/g;
    const FILLER_CHARS = '嗯啊呃哦唔唉哎诶呀哈呵额噢喔咿嘿';
    const FILLER_RE = new RegExp(
      '^(?:[' + FILLER_CHARS + ']|那个|这个|就是|然后|所以|um|uh|er|ah|hmm|mm|m){1,4}$',
      'i',
    );
    const NO_SPEECH_RE = /^(?:silence|blank|blank[_-]?audio|no[ _-]?speech|unk|none|无|空|静音|没有声音)$/i;

    function cleanTranscript(raw) {
      const text = String(raw == null ? '' : raw).replace(SURROUNDING_QUOTES, '');
      return text.trim();
    }

    function isNoSpeech(raw) {
      const text = cleanTranscript(raw);
      if (!text) return true;
      const dense = text
        .replace(/[\s.,!?;:、。，！？；：…~～\-—_*#()[\]{}<>《》]/g, '')
        .toLowerCase();
      if (!dense) return true;
      if (NO_SPEECH_RE.test(dense)) return true;
      if (dense.length <= 8 && FILLER_RE.test(dense)) return true;
      return false;
    }

    const zh = {
      'button.idle': '语音输入',
      'button.recording': '停止并转写',
      'button.transcribing': '转写中…',
      'button.error': '语音输入失败，点击重试',
      'error.permission': '麦克风权限被拒绝',
      'error.microphone': '无法使用麦克风',
      'error.network': '无法连接语音服务',
      'error.auth': 'ASR 服务拒绝了 API Key',
      'error.empty': '没有识别到语音',
      'error.tooShort': '录音时间太短',
      'error.server': 'ASR 服务返回错误',
      'error.timeout': '转写超时，音频可能过长',
      'error.parse': '服务返回了无法解析的内容',
      'notice.noSpeech': '未识别到语音',
      'fallback.copied': '转写结果已复制到剪贴板',
      'button.longPress': '长按打开设置',
      'error.endpoint': '未配置接口地址，长按麦克风设置',
      'settings.title': '语音服务设置',
      'settings.hint': '长按麦克风打开 · 兼容 OpenAI 风格 /v1/audio/transcriptions 接口',
      'settings.endpoint': '接口地址',
      'settings.endpointHint': '可填 host:port 或完整路径；根路径会自动补 /v1/audio/transcriptions',
      'settings.apiKey': 'API Key',
      'settings.language': '语言',
      'settings.model': '模型名（可选）',
      'settings.test': '测试连接',
      'settings.protocol': '接口类型',
      'settings.protocolOpenAI': 'OpenAI 兼容',
      'settings.protocolAzure': 'Azure OpenAI',
      'settings.protocolJson': 'JSON + Base64',
      'settings.authHeader': '认证头（可选）',
      'settings.responsePath': '响应字段（可选）',
      'settings.responsePathHint': '转写文本所在路径，如 data.text；留空自动识别',
      'settings.testEmptyReply': '返回',
      'settings.testing': '测试中…',
      'settings.testOk': '连接成功',
      'settings.authFailed': '鉴权失败',
      'settings.httpError': '请求失败',
      'settings.unreachable': '无法连接',
      'settings.timeout': '连接超时',
      'settings.needEndpoint': '请先填写接口地址',
      'settings.cancel': '取消',
      'settings.save': '保存',
      'settings.saved': '已保存，下一次录音生效',
    };

    const en = {
      'button.idle': 'Voice input',
      'button.recording': 'Stop and transcribe',
      'button.transcribing': 'Transcribing…',
      'button.error': 'Voice input failed, click to retry',
      'error.permission': 'Microphone permission denied',
      'error.microphone': 'Microphone unavailable',
      'error.network': 'Cannot reach the speech service',
      'error.auth': 'The ASR service rejected the API key',
      'error.empty': 'No speech recognized',
      'error.tooShort': 'Recording too short',
      'error.server': 'The ASR service returned an error',
      'error.timeout': 'The ASR request timed out',
      'error.parse': 'The ASR service returned an unreadable response',
      'notice.noSpeech': 'No speech detected',
      'fallback.copied': 'Transcript copied to the clipboard',
      'button.longPress': 'Long-press to open settings',
      'error.endpoint': 'No endpoint configured, long-press the mic to set one',
      'settings.title': 'Speech service',
      'settings.hint': 'Long-press the mic · works with any OpenAI-style /v1/audio/transcriptions endpoint',
      'settings.endpoint': 'Endpoint URL',
      'settings.endpointHint': 'host:port or a full path; a root path gets /v1/audio/transcriptions',
      'settings.apiKey': 'API key',
      'settings.language': 'Language',
      'settings.model': 'Model (optional)',
      'settings.test': 'Test',
      'settings.protocol': 'Protocol',
      'settings.protocolOpenAI': 'OpenAI compatible',
      'settings.protocolAzure': 'Azure OpenAI',
      'settings.protocolJson': 'JSON + base64',
      'settings.authHeader': 'Auth header (optional)',
      'settings.responsePath': 'Response field (optional)',
      'settings.responsePathHint': 'dot path to the transcript, e.g. data.text; empty = auto',
      'settings.testEmptyReply': 'returned',
      'settings.testing': 'Testing…',
      'settings.testOk': 'Connected',
      'settings.authFailed': 'Auth failed',
      'settings.httpError': 'Request failed',
      'settings.unreachable': 'Unreachable',
      'settings.timeout': 'Timed out',
      'settings.needEndpoint': 'Enter an endpoint first',
      'settings.cancel': 'Cancel',
      'settings.save': 'Save',
      'settings.saved': 'Saved — applies to the next recording',
    };

    const CSS = [
      '.asr-vbtn{background:none;border:none;padding:0;margin:0;display:flex;align-items:center;justify-content:center;line-height:0;cursor:pointer}',
      '.asr-vbtn[aria-disabled="true"]{cursor:progress}',
      '.asr-vbtn:hover:not([aria-disabled="true"]){filter:brightness(1.05)}',
      '.asr-vbtn:focus-visible{outline:2px solid #93c5fd;outline-offset:3px}',
      '.asr-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#ef4444;animation:asr-blink 1.4s ease-in-out infinite}',
      '.asr-wave{display:flex;align-items:center;justify-content:flex-end;gap:3px;flex:1 1 auto;min-width:0;height:22px;overflow:hidden}',
      '.asr-bar{flex:0 0 3px;width:3px;border-radius:1.5px;background:currentColor;transition:height 110ms linear,opacity 140ms linear}',
      '.asr-stop{flex:0 0 auto;width:10px;height:10px;border-radius:3px;background:currentColor;opacity:.85}',
      '.asr-fade-in{animation:asr-fade-in 320ms ease-out 120ms backwards}',
      '.asr-spin{animation:asr-spin 750ms linear infinite}',
      '@keyframes asr-spin{to{transform:rotate(360deg)}}',
      '@keyframes asr-blink{0%,100%{opacity:1}50%{opacity:.3}}',
      '@keyframes asr-fade-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}',
      '.asr-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.34);backdrop-filter:blur(3px);animation:asr-fade 160ms ease-out}',
      '.asr-dialog{width:452px;max-width:calc(100vw - 48px);max-height:calc(100vh - 72px);overflow:auto;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);border:1px solid var(--dsw-alias-border-l1,#e6e8ee);border-radius:16px;padding:0;box-shadow:0 28px 70px rgba(15,23,42,.30),0 2px 8px rgba(15,23,42,.08);font-size:13px;line-height:1.45;animation:asr-pop 200ms cubic-bezier(.2,.9,.3,1)}',
      '.asr-head{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#eef0f4)}',
      '.asr-head-icon{flex:0 0 auto;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#5b9bff,#2563eb);color:#fff;box-shadow:0 4px 10px rgba(37,99,235,.28)}',
      '.asr-dialog-title{font-size:15px;font-weight:600;margin:0;line-height:1.2}',
      '.asr-dialog-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);margin-top:2px}',
      '.asr-body{padding:16px 18px 6px}',
      '.asr-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;flex:1 1 0;min-width:0}',
      '.asr-label{font-size:11.5px;font-weight:600;letter-spacing:.01em;color:var(--dsw-alias-label-secondary,#5b6472)}',
      '.asr-hint{font-size:11px;color:var(--dsw-alias-label-secondary,#98a2b3)}',
      '.asr-row{display:flex;gap:10px}',
      '.asr-input{width:100%;box-sizing:border-box;height:36px;padding:0 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#dfe3ea);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;outline:none;transition:border-color 140ms ease,box-shadow 140ms ease,background-color 140ms ease}',
      '.asr-input:hover{border-color:#c3cbd8}',
      '.asr-input:focus{border-color:#4176e6;box-shadow:0 0 0 3px rgba(65,118,230,.16)}',
      '.asr-input::placeholder{color:#a8b0bd}',
      '.asr-select{width:100%;box-sizing:border-box;height:36px;padding:0 32px 0 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#dfe3ea);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;text-align:left;cursor:pointer;position:relative;display:flex;align-items:center;transition:border-color 140ms ease,box-shadow 140ms ease}',
      '.asr-select:hover{border-color:#c3cbd8}',
      '.asr-select:focus-visible{border-color:#4176e6;box-shadow:0 0 0 3px rgba(65,118,230,.16);outline:none}',
      '.asr-select-caret{position:absolute;right:10px;top:50%;width:12px;height:12px;margin-top:-6px;pointer-events:none;opacity:.55;transition:transform 160ms ease}',
      '.asr-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;padding:5px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1,#e6e8ee);background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 16px 40px rgba(15,23,42,.18);animation:asr-pop 140ms ease-out}',
      '.asr-option{display:flex;align-items:center;justify-content:space-between;width:100%;height:32px;padding:0 10px;border:none;border-radius:7px;background:transparent;color:inherit;font-size:12.5px;text-align:left;cursor:pointer;transition:background-color 110ms ease}',
      '.asr-option:hover{background:rgba(65,118,230,.08)}',
      '.asr-option.active{background:rgba(65,118,230,.12);color:#2563eb;font-weight:600}',
      '.asr-divider{height:1px;background:var(--dsw-alias-border-l1,#eef0f4);margin:2px 0 14px}',
      '.asr-test-row{display:flex;align-items:center;gap:10px;margin:0 0 14px}',
      '.asr-test{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.asr-test.ok{color:var(--dsw-alias-state-success-primary,#12a150)}',
      '.asr-test.bad{color:var(--dsw-alias-state-error-primary,#e11d48)}',
      '.asr-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--dsw-alias-border-l1,#eef0f4);background:linear-gradient(180deg,rgba(248,250,253,0),rgba(248,250,253,.6))}',
      '.asr-btn{height:34px;padding:0 15px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#dfe3ea);background:var(--dsw-alias-bg-base,#fff);color:inherit;font-size:13px;cursor:pointer;transition:background-color 120ms ease,box-shadow 120ms ease,transform 80ms ease}',
      '.asr-btn:hover{background:rgba(15,23,42,.04)}',
      '.asr-btn:active{transform:scale(.97)}',
      '.asr-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(65,118,230,.2)}',
      '.asr-btn-primary{background:#4176e6;border-color:#4176e6;color:#fff}',
      '.asr-btn-primary:hover{background:#3568d4}',
      '@keyframes asr-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes asr-pop{from{opacity:0;transform:scale(.97) translateY(4px)}to{opacity:1;transform:none}}',
      '.asr-toast{padding:8px 12px;border-radius:10px;background:#1f2937;color:#fff;font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(15,23,42,.22);animation:asr-fade-in 180ms ease-out}',
      '.asr-toast.bad{background:#b91c1c}',
      '.asr-panel:hover{filter:brightness(0.99)}',
    ].join('\n');

    function writeString(view, offset, value) {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    }

    function encodeWav(chunks, sampleRate) {
      let frames = 0;
      for (let i = 0; i < chunks.length; i += 1) frames += chunks[i].length;
      const buffer = new ArrayBuffer(44 + frames * 2);
      const view = new DataView(buffer);
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + frames * 2, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(view, 36, 'data');
      view.setUint32(40, frames * 2, true);
      let offset = 44;
      for (let c = 0; c < chunks.length; c += 1) {
        const chunk = chunks[c];
        for (let i = 0; i < chunk.length; i += 1) {
          const sample = Math.max(-1, Math.min(1, chunk[i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += 2;
        }
      }
      return new Blob([view], { type: 'audio/wav' });
    }

    function SelectField(props) {
      const [open, setOpen] = React.useState(false);
      const ref = React.useRef(null);

      React.useEffect(() => {
        if (!open) return undefined;
        const onDoc = (event) => {
          if (ref.current && !ref.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
      }, [open]);

      const current = props.options.find((option) => option.value === props.value) || props.options[0];

      return h(
        'div',
        { ref: ref, style: { position: 'relative' } },
        h(
          'button',
          {
            type: 'button',
            className: 'asr-select',
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen((value) => !value),
            onKeyDown: (event) => {
              if (event.key === 'Escape') setOpen(false);
            },
          },
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, current ? current.label : ''),
          h(
            'svg',
            { className: 'asr-select-caret', viewBox: '0 0 24 24', 'aria-hidden': true, style: { transform: open ? 'rotate(180deg)' : 'none' } },
            h('path', { d: 'M6 9l6 6 6-6', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
          ),
        ),
        open
          ? h(
              'div',
              { className: 'asr-menu', role: 'listbox' },
              props.options.map((option) =>
                h(
                  'button',
                  {
                    key: option.value,
                    type: 'button',
                    role: 'option',
                    'aria-selected': option.value === props.value ? 'true' : 'false',
                    className: 'asr-option' + (option.value === props.value ? ' active' : ''),
                    onClick: () => {
                      props.onChange(option.value);
                      setOpen(false);
                    },
                  },
                  h('span', null, option.label),
                  option.value === props.value
                    ? h(
                        'svg',
                        { width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': true },
                        h('path', { d: 'M20 6L9 17l-5-5', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                      )
                    : null,
                ),
              ),
            )
          : null,
      );
    }

    function VoiceButton(props) {
      const { inputActions, t } = props;
      const [phase, setPhase] = React.useState('idle');
      const [notice, setNotice] = React.useState('');
      const [fading, setFading] = React.useState(false);
      const [shrinking, setShrinking] = React.useState(false);
      const [panelRect, setPanelRect] = React.useState(null);
      const [entered, setEntered] = React.useState(false);

      const recording = phase === 'recording';
      const panelOpen = recording || fading || shrinking;
      const panelWide = recording || fading;
      const [toastPos, setToastPos] = React.useState(null);
      const [settings, setSettings] = React.useState(loadSettings);
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      const [draft, setDraft] = React.useState(loadSettings);
      const [testState, setTestState] = React.useState(null);
      const [levels, setLevels] = React.useState(function () {
        return new Array(256).fill(0);
      });
      const sessionRef = React.useRef(null);
      const pendingRef = React.useRef(false);
      const levelsRef = React.useRef(new Array(256).fill(0));
      const pillRef = React.useRef(null);
      const fadeTimerRef = React.useRef(null);
      const collapseTimerRef = React.useRef(null);
      const releaseTimerRef = React.useRef(null);
      const measureTimerRef = React.useRef(null);
      const panelRef = React.useRef(null);

      const measurePanel = React.useCallback(() => {
        const el = pillRef.current;
        if (!el) return;
        const button = el.getBoundingClientRect();
        let node = el.parentElement;
        let target = null;
        for (let depth = 0; depth < 8 && node; depth += 1) {
          const rect = node.getBoundingClientRect();
          if (rect.width >= 240) target = rect;
          if (rect.width >= 480) break;
          node = node.parentElement;
        }
        const row = target || { left: button.left - 240, right: button.right };
        setPanelRect({
          left: Math.max(row.left + 10, 8),
          right: button.right,
          top: button.top,
          height: button.height || 34,
        });
      }, []);

      React.useEffect(() => {
        measurePanel();
        const onResize = () => measurePanel();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [measurePanel, phase]);

      React.useEffect(() => {
        if (!panelOpen) {
          setEntered(false);
          return undefined;
        }
        const id = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(id);
      }, [panelOpen]);

      React.useEffect(() => {
        if (!notice) {
          setToastPos(null);
          return undefined;
        }
        const el = pillRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          setToastPos({ top: rect.top, right: Math.max(12, window.innerWidth - rect.right) });
        }
        const timer = setTimeout(() => setNotice(''), phase === 'error' ? 6000 : 2600);
        return () => clearTimeout(timer);
      }, [notice, phase]);

      const tr = React.useCallback(
        (key, fallback) => {
          try {
            const value = typeof t === 'function' ? t(key) : undefined;
            return value && value !== key ? value : fallback;
          } catch (error) {
            return fallback;
          }
        },
        [t],
      );

      const release = React.useCallback(() => {
        const session = sessionRef.current;
        sessionRef.current = null;
        if (!session) return;
        if (session.timer) clearTimeout(session.timer);
        if (session.raf) cancelAnimationFrame(session.raf);
        for (const node of [session.processor, session.source, session.mute, session.analyser]) {
          if (node) {
            try {
              node.disconnect();
            } catch (error) {

            }
          }
        }
        if (session.stream) {
          session.stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (error) {

            }
          });
        }
        if (session.audioCtx && session.audioCtx.state !== 'closed') {
          session.audioCtx.close().catch(() => {});
        }
      }, []);

      React.useEffect(
        () => () => {
          if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
          if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
          if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
          if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
          release();
        },
        [release],
      );

      const resetLevels = React.useCallback(() => {
        levelsRef.current = new Array(256).fill(0);
        setLevels(levelsRef.current.slice());
      }, []);

      const upload = React.useCallback(
        async (blob) => {
          const endpoint = resolveEndpointFor(settings);
          if (!endpoint) {
            setNotice(tr('error.endpoint', 'No endpoint configured'));
            setPhase('error');
            return;
          }
          let request;
          try {
            request = await buildRequest(settings, blob, 'speech.wav');
          } catch (error) {
            setNotice(tr('error.server', 'Could not build the request'));
            setPhase('error');
            return;
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 90000);
          let response;
          try {
            response = await fetch(request.url, Object.assign({ signal: controller.signal }, request.init));
          } catch (error) {
            const aborted = error && error.name === 'AbortError';
            setNotice(
              aborted
                ? tr('error.timeout', 'The ASR request timed out')
                : tr('error.network', 'Cannot reach the ASR service'),
            );
            setPhase('error');
            return;
          } finally {
            clearTimeout(timer);
          }

          if (response.status === 401 || response.status === 403) {
            setNotice(tr('error.auth', 'The ASR service rejected the API key'));
            setPhase('error');
            return;
          }
          if (!response.ok) {
            let detail = '';
            try {
              const body = await response.json();
              detail = String((body && (body.detail || body.error || body.message)) || '').slice(0, 200);
            } catch (error) {

            }
            setNotice(
              tr('error.server', 'The ASR service returned an error') +
                ' (' +
                response.status +
                ')' +
                (detail ? ' · ' + detail : ''),
            );
            setPhase('error');
            return;
          }

          let text = '';
          try {
            const data = await response.json();
            text = cleanTranscript(extractText(data, settings.responsePath));
          } catch (error) {
            setNotice(tr('error.parse', 'The ASR service returned an unreadable response'));
            setPhase('error');
            return;
          }

          if (isNoSpeech(text)) {
            setNotice(tr('notice.noSpeech', 'No speech detected'));
            setPhase('idle');
            return;
          }

          if (!text) {
            setNotice(tr('error.empty', 'No speech recognized'));
            setPhase('error');
            return;
          }

          let inserted = false;
          try {
            const span = inputActions && inputActions.captureInsertion ? inputActions.captureInsertion() : undefined;
            inserted = !!(inputActions && inputActions.insertText && inputActions.insertText(text, span));
          } catch (error) {
            inserted = false;
          }
          if (!inserted) {
            try {
              await navigator.clipboard.writeText(text);
            } catch (error) {

            }
            setNotice(tr('fallback.copied', 'Transcript copied to the clipboard'));
          } else {
            setNotice('');
          }
          setPhase('idle');
        },
        [inputActions, settings, tr],
      );

      const stop = React.useCallback(
        (explicit) => {
          const session = explicit || sessionRef.current;
          if (!session) return;
          const seconds = (performance.now() - session.startedAt) / 1000;
          const chunks = session.chunks;
          release();
          resetLevels();
          if (seconds < MIN_SECONDS) {
            setNotice(tr('error.tooShort', 'Recording too short'));
            setPhase('error');
            return;
          }
          setFading(true);
          if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
          fadeTimerRef.current = setTimeout(() => {
            fadeTimerRef.current = null;
            setFading(false);
            setShrinking(true);
            if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = setTimeout(() => {
              collapseTimerRef.current = null;
              setShrinking(false);
            }, 500);
          }, 220);
          setPhase('transcribing');
          setNotice('');
          upload(encodeWav(chunks, SAMPLE_RATE));
        },
        [release, resetLevels, tr, upload],
      );

      const start = React.useCallback(async () => {
        if (pendingRef.current) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setNotice(tr('error.microphone', 'Microphone unavailable'));
          setPhase('error');
          return;
        }
        pendingRef.current = true;
        setNotice('');
        if (fadeTimerRef.current) {
          clearTimeout(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
        if (releaseTimerRef.current) {
          clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = null;
        }
        setFading(false);
        setShrinking(false);
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (error) {
          pendingRef.current = false;
          const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
          setNotice(tr(denied ? 'error.permission' : 'error.microphone', 'Microphone unavailable'));
          setPhase('error');
          return;
        }
        pendingRef.current = false;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          stream.getTracks().forEach((track) => track.stop());
          setNotice(tr('error.microphone', 'Microphone unavailable'));
          setPhase('error');
          return;
        }

        const audioCtx = new AudioCtx({ sampleRate: SAMPLE_RATE });
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        const mute = audioCtx.createGain();
        mute.gain.value = 0;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.65;
        const chunks = [];
        const samples = new Uint8Array(analyser.fftSize);

        processor.onaudioprocess = (event) => {
          chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        };
        source.connect(processor);
        source.connect(analyser);
        processor.connect(mute);
        mute.connect(audioCtx.destination);

        const session = {
          stream: stream,
          audioCtx: audioCtx,
          source: source,
          processor: processor,
          mute: mute,
          analyser: analyser,
          chunks: chunks,
          startedAt: performance.now(),
          timer: null,
          raf: 0,
        };

        let last = 0;
        const tick = (timestamp) => {
          if (!sessionRef.current || sessionRef.current !== session) return;
          session.raf = requestAnimationFrame(tick);
          if (timestamp - last < 90) return;
          last = timestamp;
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i += 1) {
            const value = (samples[i] - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / samples.length);
          const level = Math.min(1, rms * 4.5);
          levelsRef.current = levelsRef.current.slice(1).concat(level);
          setLevels(levelsRef.current.slice());
        };

        session.timer = setTimeout(() => stop(session), MAX_SECONDS * 1000);
        session.raf = requestAnimationFrame(tick);
        sessionRef.current = session;
        measurePanel();
        setPhase('recording');
      }, [measurePanel, stop, tr]);

      const pressTimerRef = React.useRef(null);
      const longPressedRef = React.useRef(false);

      const openSettings = React.useCallback(() => {
        setDraft(settings);
        setTestState(null);
        setSettingsOpen(true);
      }, [settings]);

      const closeSettings = React.useCallback(() => setSettingsOpen(false), []);

      const beginPress = React.useCallback(() => {
        longPressedRef.current = false;
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
        pressTimerRef.current = setTimeout(() => {
          pressTimerRef.current = null;
          longPressedRef.current = true;
          openSettings();
        }, 550);
      }, [openSettings]);

      const endPress = React.useCallback(() => {
        if (pressTimerRef.current) {
          clearTimeout(pressTimerRef.current);
          pressTimerRef.current = null;
        }
      }, []);

      React.useEffect(
        () => () => {
          if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
        },
        [],
      );

      React.useEffect(() => {
        if (!settingsOpen) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') closeSettings();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [settingsOpen, closeSettings]);

      const runTest = React.useCallback(async () => {
        if (!resolveEndpointFor(draft)) {
          setTestState({ ok: false, text: tr('settings.needEndpoint', 'Enter an endpoint first') });
          return;
        }
        setTestState({ ok: null, text: tr('settings.testing', 'Testing…') });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const request = await buildRequest(draft, silentWav(0.5), 'probe.wav');
          const response = await fetch(request.url, Object.assign({ signal: controller.signal }, request.init));
          if (response.status === 401 || response.status === 403) {
            setTestState({ ok: false, text: tr('settings.authFailed', 'Auth failed') + ' (' + response.status + ')' });
            return;
          }
          if (!response.ok) {
            setTestState({ ok: false, text: tr('settings.httpError', 'Request failed') + ' (' + response.status + ')' });
            return;
          }
          let sample = '';
          try {
            sample = extractText(await response.json(), draft.responsePath);
          } catch (error) {
            sample = '';
          }
          setTestState({
            ok: true,
            text: sample
              ? tr('settings.testOk', 'Connected') + ' · ' + tr('settings.testEmptyReply', 'returned "') + sample.slice(0, 12) + '"'
              : tr('settings.testOk', 'Connected'),
          });
        } catch (error) {
          const aborted = error && error.name === 'AbortError';
          setTestState({ ok: false, text: tr(aborted ? 'settings.timeout' : 'settings.unreachable', 'Unreachable') });
        } finally {
          clearTimeout(timer);
        }
      }, [draft, tr]);

      const saveDraft = React.useCallback(() => {
        const next = Object.assign({}, draft, {
          endpoint: String(draft.endpoint || '').trim(),
          apiKey: String(draft.apiKey || '').trim(),
          language: String(draft.language || '').trim() || 'Chinese',
          model: String(draft.model || '').trim(),
          protocol: PROTOCOLS.indexOf(draft.protocol) >= 0 ? draft.protocol : 'openai',
          authHeader: String(draft.authHeader || '').trim(),
          responsePath: String(draft.responsePath || '').trim(),
        });
        setSettings(next);
        persistSettings(next);
        setSettingsOpen(false);
        setNotice('');
        if (phase === 'error') setPhase('idle');
      }, [draft, phase]);

      const label =
        phase === 'recording'
          ? tr('button.recording', 'Stop and transcribe')
          : phase === 'transcribing'
            ? tr('button.transcribing', 'Transcribing…')
            : phase === 'error'
              ? tr('button.error', 'Voice input failed, click to retry')
              : tr('button.idle', 'Voice input');

      const palette =
        phase === 'error'
          ? { background: '#e11d48', border: '1px solid transparent', color: '#ffffff' }
          : { background: '#4176e6', border: '1px solid transparent', color: '#ffffff' };

      const micIcon = h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.1,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', pointerEvents: 'none' },
        },
        h('rect', { x: 9, y: 2.5, width: 6, height: 11, rx: 3 }),
        h('path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0' }),
        h('path', { d: 'M12 17.5V21' }),
        h('path', { d: 'M8.5 21h7' }),
      );

      const spinnerIcon = h(
        'svg',
        {
          width: 18,
          height: 18,
          viewBox: '0 0 24 24',
          className: 'asr-spin',
          'aria-hidden': true,
          style: {
            display: 'block',
            pointerEvents: 'none',
            transformOrigin: '50% 50%',
            animation: 'asr-spin 800ms linear infinite',
          },
        },
        h('circle', {
          cx: 12,
          cy: 12,
          r: 8,
          fill: 'none',
          stroke: 'rgba(255,255,255,0.35)',
          strokeWidth: 2.2,
        }),
        h('circle', {
          cx: 12,
          cy: 12,
          r: 8,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.2,
          strokeDasharray: '16 35',
          strokeLinecap: 'round',
        }),
      );

      const panelFullWidth = panelRect ? Math.max(34, panelRect.right - panelRect.left) : 34;
      const barCount = Math.max(10, Math.min(140, Math.floor((panelFullWidth - 34) / 6)));
      const visible = levels.slice(-barCount);
      const waveBars = visible.map((level, index) => {
        const height = 3 + Math.min(1, level * 1.9) * 15;
        return h('span', {
          key: index,
          className: 'asr-bar',
          style: {
            height: height,
            opacity: 0.4 + Math.min(0.6, level * 1.7),
          },
        });
      });

      const buttonContent = phase === 'transcribing' ? spinnerIcon : micIcon;

      const rect = panelRect;
      const panelNode =
        panelOpen && rect
          ? h(
              'div',
              {
                className: 'asr-panel',
                ref: panelRef,
                role: 'button',
                tabIndex: -1,
                'aria-label': tr('button.recording', 'Stop and transcribe'),
                onClick: () => stop(),
                style: {
                  position: 'fixed',
                  top: rect.top,
                  right: Math.max(0, window.innerWidth - rect.right),
                  height: rect.height,
                  width: panelWide && entered ? Math.max(34, rect.right - rect.left) : 34,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  padding: panelWide && entered ? '0 12px' : 0,
                  borderRadius: 17,
                  border: '1px solid transparent',
                  background: '#4176e6',
                  color: '#ffffff',
                  overflow: 'hidden',
                  zIndex: 2147482000,
                  boxShadow: '0 8px 22px rgba(65,118,230,0.35)',
                  cursor: 'pointer',
                  transition:
                    'width 480ms cubic-bezier(.16,1,.3,1), padding 480ms cubic-bezier(.16,1,.3,1)',
                },
              },
              h(
                'span',
                {
                  key: 'content',
                  className: 'asr-fade-in',
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: '1 1 auto',
                    minWidth: 0,
                    height: '100%',
                    opacity: fading || shrinking ? 0 : 1,
                    transition: 'opacity 180ms ease',
                  },
                },
                h('span', { key: 'dot', className: 'asr-dot', style: { background: '#ffffff' } }),
                h('span', { key: 'wave', className: 'asr-wave' }, waveBars),
                h('span', { key: 'stop', className: 'asr-stop' }),
              ),
            )
          : null;

      const panel =
        panelNode && createPortal && typeof document !== 'undefined'
          ? createPortal(panelNode, document.body)
          : panelNode;

      const field = (labelText, node, hint) =>
        h(
          'label',
          { className: 'asr-field' },
          h('span', { className: 'asr-label' }, labelText),
          node,
          hint ? h('span', { className: 'asr-hint' }, hint) : null,
        );

      const protocolOptions = [
        { value: 'openai', label: tr('settings.protocolOpenAI', 'OpenAI compatible') },
        { value: 'azure', label: tr('settings.protocolAzure', 'Azure OpenAI') },
        { value: 'json', label: tr('settings.protocolJson', 'JSON + base64') },
      ];

      const modal = settingsOpen
        ? h(
            'div',
            {
              className: 'asr-backdrop',
              onMouseDown: (event) => {
                if (event.target === event.currentTarget) closeSettings();
              },
            },
            h(
              'div',
              {
                className: 'asr-dialog',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': tr('settings.title', 'Speech service'),
                onMouseDown: (event) => event.stopPropagation(),
              },
              h(
                'div',
                { className: 'asr-head' },
                h(
                  'div',
                  { className: 'asr-head-icon' },
                  h(
                    'svg',
                    {
                      width: 18,
                      height: 18,
                      viewBox: '0 0 24 24',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                      'aria-hidden': true,
                    },
                    h('rect', { x: 9, y: 2.5, width: 6, height: 11, rx: 3 }),
                    h('path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0' }),
                    h('path', { d: 'M12 17.5V21' }),
                    h('path', { d: 'M8.5 21h7' }),
                  ),
                ),
                h(
                  'div',
                  { style: { minWidth: 0 } },
                  h('div', { className: 'asr-dialog-title' }, tr('settings.title', 'Speech service')),
                  h('div', { className: 'asr-dialog-hint' }, tr('settings.hint', '')),
                ),
              ),
              h(
                'div',
                { className: 'asr-body' },
              field(
                tr('settings.endpoint', 'Endpoint URL'),
                h('input', {
                  autoFocus: true,
                  className: 'asr-input',
                  value: draft.endpoint,
                  placeholder: 'http://127.0.0.1:8010',
                  spellCheck: false,
                  onChange: (event) => setDraft(Object.assign({}, draft, { endpoint: event.target.value })),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') saveDraft();
                  },
                }),
                tr('settings.endpointHint', ''),
              ),
              h(
                'div',
                { className: 'asr-row' },
                field(
                  tr('settings.protocol', 'Protocol'),
                  h(SelectField, {
                    value: draft.protocol || 'openai',
                    options: protocolOptions,
                    onChange: (next) => setDraft(Object.assign({}, draft, { protocol: next })),
                  }),
                ),
                field(
                  tr('settings.authHeader', 'Auth header'),
                  h('input', {
                    className: 'asr-input',
                    value: draft.authHeader,
                    placeholder: 'auto',
                    spellCheck: false,
                    onChange: (event) => setDraft(Object.assign({}, draft, { authHeader: event.target.value })),
                  }),
                ),
              ),
              field(
                tr('settings.apiKey', 'API key'),
                h('input', {
                  className: 'asr-input',
                  type: 'password',
                  value: draft.apiKey,
                  placeholder: 'Bearer token',
                  spellCheck: false,
                  onChange: (event) => setDraft(Object.assign({}, draft, { apiKey: event.target.value })),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') saveDraft();
                  },
                }),
              ),
              h(
                'div',
                { className: 'asr-row' },
                field(
                  tr('settings.language', 'Language'),
                  h('input', {
                    className: 'asr-input',
                    value: draft.language,
                    placeholder: 'Chinese / auto',
                    spellCheck: false,
                    onChange: (event) => setDraft(Object.assign({}, draft, { language: event.target.value })),
                  }),
                ),
                field(
                  tr('settings.model', 'Model'),
                  h('input', {
                    className: 'asr-input',
                    value: draft.model,
                    placeholder: 'whisper-1',
                    spellCheck: false,
                    onChange: (event) => setDraft(Object.assign({}, draft, { model: event.target.value })),
                  }),
                ),
              ),
              field(
                tr('settings.responsePath', 'Response field'),
                h('input', {
                  className: 'asr-input',
                  value: draft.responsePath,
                  placeholder: 'text',
                  spellCheck: false,
                  onChange: (event) => setDraft(Object.assign({}, draft, { responsePath: event.target.value })),
                }),
                tr('settings.responsePathHint', 'dot path to the transcript, e.g. data.text'),
              ),
              h(
                'div',
                { className: 'asr-test-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'asr-btn asr-btn-ghost',
                    onClick: runTest,
                  },
                  tr('settings.test', 'Test'),
                ),
                testState
                  ? h(
                      'span',
                      {
                        className:
                          'asr-test ' +
                          (testState.ok === true ? 'ok' : testState.ok === false ? 'bad' : ''),
                      },
                      testState.text,
                    )
                  : null,
              ),
              ),
              h(
                'div',
                { className: 'asr-actions' },
                h(
                  'button',
                  { type: 'button', className: 'asr-btn', onClick: closeSettings },
                  tr('settings.cancel', 'Cancel'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'asr-btn asr-btn-primary', onClick: saveDraft },
                  tr('settings.save', 'Save'),
                ),
              ),
            ),
          )
        : null;

      const toast =
        notice && toastPos
          ? h(
              'div',
              {
                className: 'asr-toast' + (phase === 'error' ? ' bad' : ''),
                role: 'status',
                style: {
                  position: 'fixed',
                  right: toastPos.right,
                  bottom: Math.max(12, window.innerHeight - toastPos.top + 10),
                  maxWidth: 360,
                  zIndex: 2147482500,
                },
              },
              notice,
            )
          : null;

      return h(
        React.Fragment,
        null,
        h(
          'span',
          {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              flex: '0 0 auto',
              minWidth: 0,
            },
          },
          h('style', null, CSS),
          h(
            'div',
            {
              ref: pillRef,
              role: 'button',
              tabIndex: 0,
              className: 'asr-vbtn',
              title: (notice ? label + ' — ' + notice : label) + ' · ' + tr('button.longPress', 'Long-press for settings'),
              'aria-label': label,
              'aria-pressed': recording,
              'aria-disabled': phase === 'transcribing' ? 'true' : 'false',
              onPointerDown: (event) => {
                if (event.button !== 0) return;
                beginPress();
              },
              onPointerUp: endPress,
              onPointerLeave: endPress,
              onPointerCancel: endPress,
              onClick: () => {
                if (longPressedRef.current) {
                  longPressedRef.current = false;
                  return;
                }
                if (recording) stop();
                else if (phase !== 'transcribing') start();
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault();
                  openSettings();
                  return;
                }
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (recording) stop();
                else if (phase !== 'transcribing') start();
              },
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxSizing: 'border-box',
                width: 34,
                minWidth: 34,
                height: 34,
                minHeight: 34,
                padding: 0,
                margin: 0,
                border: palette.border,
                borderRadius: 17,
                background: palette.background,
                color: palette.color,
                overflow: 'hidden',
                outline: 'none',
                cursor: phase === 'transcribing' ? 'progress' : 'pointer',
                lineHeight: 0,
                transition: 'background-color 320ms ease, border-color 320ms ease, color 220ms ease',
              },
            },
            buttonContent,
          ),
        ),
        panel,
        toast,
        modal,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          try {
            return ctx.locale.register(NS, { zh, en });
          } catch (error) {
            return () => {};
          }
        });
        ctx.slots.inject('conversation.input.activity', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.activity',
              locale: NS,
            },
            VoiceButton,
          ),
        );
      },
    };
  },
});
