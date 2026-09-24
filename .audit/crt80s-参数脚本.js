const fs = require('fs');

// 1. CRT80s - JSON
let crtJsonPath = 'src/skins/crt80s/skin.json';
let crtJson = JSON.parse(fs.readFileSync(crtJsonPath, 'utf8'));
crtJson.params.push({
  id: "hue",
  label: "荧光色相",
  group: "屏幕",
  token: "--kami-crt-hue",
  unit: "deg",
  min: 0,
  max: 360,
  step: 5,
  value: 0
});
fs.writeFileSync(crtJsonPath, JSON.stringify(crtJson, null, 2), 'utf8');

// 2. CRT80s - CSS
let crtCssPath = 'src/skins/crt80s/skin.css';
let crtCss = fs.readFileSync(crtCssPath, 'utf8');

if (!crtCss.includes('--kami-crt-hue')) {
    crtCss = crtCss.replace('--kami-fg: #8affa9;', '--kami-fg: #8affa9;\n  --kami-crt-hue: 0deg;');
    // Add filter: hue-rotate
    crtCss = crtCss.replace(/html\[data-kami-skin="crt80s"\] \.kami-root\s*\{/, 
      'html[data-kami-skin="crt80s"] .kami-root {\n  filter: hue-rotate(var(--kami-crt-hue));');
}

if (!crtCss.includes('@keyframes kami-crt-scan')) {
    // Add animation keyframes
    const anim = `
@keyframes kami-crt-scan {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}
html[data-kami-skin="crt80s"][data-kami-effects~="scan"] .kami-surface::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; height: 15vh;
  background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent);
  pointer-events: none;
  animation: kami-crt-scan 4s linear infinite;
  z-index: 999;
}
html[data-kami-skin="crt80s"][data-kami-effects~="scan"][data-kami-motion="calm"] .kami-surface::before,
html[data-kami-skin="crt80s"][data-kami-effects~="scan"][data-kami-motion="off"] .kami-surface::before {
  animation: none !important;
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  html[data-kami-skin="crt80s"][data-kami-effects~="scan"] .kami-surface::before {
    animation: none !important;
    display: none;
  }
}
`;
    crtCss += anim;
}

// MD styling for crt80s
if (!crtCss.includes('.kami-md')) {
    const crtMd = `
/* MD */
html[data-kami-skin="crt80s"] .kami-md {
  padding: var(--kami-pad-lg-y) var(--kami-pad-lg-x);
  border: var(--kami-border-w) solid var(--kami-line);
  background-color: var(--kami-bg-soft);
  color: var(--kami-fg);
  font-size: var(--kami-fs-sm);
  text-wrap: pretty;
  overflow-wrap: anywhere;
}
html[data-kami-skin="crt80s"] .kami-root[data-kami-comp="panel"] .kami-md {
  background-color: var(--kami-card-2);
  border-color: var(--kami-line);
  color: var(--kami-fg-dim);
}
html[data-kami-skin="crt80s"] .kami-md > :first-child { margin-top: 0; }
html[data-kami-skin="crt80s"] .kami-md > :last-child { margin-bottom: 0; }
html[data-kami-skin="crt80s"] .kami-md p { margin: .6em 0; }
html[data-kami-skin="crt80s"] .kami-md h1,
html[data-kami-skin="crt80s"] .kami-md h2,
html[data-kami-skin="crt80s"] .kami-md h3 {
  margin: 1em 0 .42em;
  font-family: var(--kami-font-title);
  font-weight: var(--kami-fw-title);
  font-size: var(--kami-fs);
  color: inherit;
  border-bottom: 1px solid var(--kami-line);
  padding-bottom: .2em;
}
html[data-kami-skin="crt80s"] .kami-md strong { font-weight: 700; color: inherit; text-shadow: 0 0 var(--kami-glow-size) var(--kami-glow); }
html[data-kami-skin="crt80s"] .kami-md em { font-style: italic; }
html[data-kami-skin="crt80s"] .kami-md a {
  color: var(--kami-accent);
  text-decoration: underline;
  text-shadow: 0 0 var(--kami-glow-size) var(--kami-glow);
}
html[data-kami-skin="crt80s"] .kami-md ul,
html[data-kami-skin="crt80s"] .kami-md ol { margin: .55em 0; padding-left: 1.5em; }
html[data-kami-skin="crt80s"] .kami-md li { margin: .3em 0; }
html[data-kami-skin="crt80s"] .kami-md ul > li::marker { color: var(--kami-accent); }
html[data-kami-skin="crt80s"] .kami-md ol > li::marker { color: var(--kami-accent); font-weight: bold; }
html[data-kami-skin="crt80s"] .kami-md blockquote {
  margin: .7em 0;
  padding: .2em 0 .2em 1em;
  border-left: 4px solid var(--kami-accent);
  background-color: var(--kami-t1);
  color: var(--kami-fg-dim);
}
html[data-kami-skin="crt80s"] .kami-md code {
  padding: 2px 5px;
  background-color: var(--kami-t1);
  border: 1px solid var(--kami-line);
  font-family: var(--kami-font-mono);
  font-size: .86em;
  color: var(--kami-accent);
}
html[data-kami-skin="crt80s"] .kami-md pre {
  margin: .7em 0;
  padding: var(--kami-pad-y) var(--kami-pad-x);
  border: 1px solid var(--kami-line);
  background-color: var(--kami-t2);
  overflow-x: auto;
}
html[data-kami-skin="crt80s"] .kami-md pre code {
  padding: 0; background: none; border: 0; color: var(--kami-fg-dim);
}
html[data-kami-skin="crt80s"] .kami-md hr {
  height: 1px;
  margin: 1em 0;
  border: 0;
  background-color: var(--kami-line);
}
html[data-kami-skin="crt80s"] .kami-md table { width: 100%; border-collapse: collapse; font-size: var(--kami-fs-xs); }
html[data-kami-skin="crt80s"] .kami-md th,
html[data-kami-skin="crt80s"] .kami-md td {
  padding: 6px 10px;
  border: 1px solid var(--kami-line);
  text-align: left;
}
html[data-kami-skin="crt80s"] .kami-md th { background-color: var(--kami-t1); font-weight: bold; color: var(--kami-accent); }
html[data-kami-skin="crt80s"] .kami-md img { max-width: 100%; filter: brightness(0.8) sepia(1) hue-rotate(var(--kami-crt-hue)) saturate(2); }
`;
    crtCss += crtMd;
}

fs.writeFileSync(crtCssPath, crtCss, 'utf8');

// 3. Terminal
let termCssPath = 'src/skins/terminal/skin.css';
let termCss = fs.readFileSync(termCssPath, 'utf8');

if (!termCss.includes('.kami-md')) {
    // Add grid background to texture
    // Enhance ASCII style
    termCss = termCss.replace(/--kami-texture: (.*?);/g, '--kami-texture: $1, linear-gradient(rgba(62, 224, 127, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(62, 224, 127, 0.04) 1px, transparent 1px); background-size: 100% 100%, 20px 20px, 20px 20px;');
    
    // Add ASCII prompt
    termCss += `
/* ASCII Enhancement */
html[data-kami-skin="terminal"] .kami-item .kami-card-title::before {
  content: "> ";
  color: var(--kami-accent);
  opacity: 0.8;
  font-family: var(--kami-font-mono);
}
html[data-kami-skin="terminal"] .kami-title::before {
  content: "$ ";
  color: var(--kami-accent);
  opacity: 0.8;
  font-family: var(--kami-font-mono);
}

/* MD */
html[data-kami-skin="terminal"] .kami-md {
  padding: var(--kami-pad-lg-y) var(--kami-pad-lg-x);
  border: 1px solid var(--kami-line-strong);
  background-color: var(--kami-bg);
  color: var(--kami-fg);
  font-size: var(--kami-fs-sm);
  text-wrap: pretty;
  overflow-wrap: anywhere;
}
html[data-kami-skin="terminal"] .kami-root[data-kami-comp="panel"] .kami-md {
  background-color: var(--kami-card-2);
  border-color: var(--kami-line);
}
html[data-kami-skin="terminal"] .kami-md > :first-child { margin-top: 0; }
html[data-kami-skin="terminal"] .kami-md > :last-child { margin-bottom: 0; }
html[data-kami-skin="terminal"] .kami-md p { margin: .6em 0; }
html[data-kami-skin="terminal"] .kami-md h1,
html[data-kami-skin="terminal"] .kami-md h2,
html[data-kami-skin="terminal"] .kami-md h3 {
  margin: 1em 0 .42em;
  font-family: var(--kami-font-mono);
  font-weight: bold;
  color: var(--kami-fg);
}
html[data-kami-skin="terminal"] .kami-md h1::before,
html[data-kami-skin="terminal"] .kami-md h2::before,
html[data-kami-skin="terminal"] .kami-md h3::before {
  content: "### ";
  color: var(--kami-accent);
  opacity: 0.8;
}
html[data-kami-skin="terminal"] .kami-md strong { font-weight: bold; color: var(--kami-accent); }
html[data-kami-skin="terminal"] .kami-md em { font-style: italic; }
html[data-kami-skin="terminal"] .kami-md a {
  color: var(--kami-accent);
  text-decoration: underline;
}
html[data-kami-skin="terminal"] .kami-md ul,
html[data-kami-skin="terminal"] .kami-md ol { margin: .55em 0; padding-left: 2em; }
html[data-kami-skin="terminal"] .kami-md li { margin: .3em 0; }
html[data-kami-skin="terminal"] .kami-md ul { list-style: none; }
html[data-kami-skin="terminal"] .kami-md ul > li::before {
  content: "»";
  position: absolute;
  left: 0.5em;
  color: var(--kami-accent);
  font-family: var(--kami-font-mono);
}
html[data-kami-skin="terminal"] .kami-md ol { list-style: decimal-leading-zero; }
html[data-kami-skin="terminal"] .kami-md ol > li::marker { color: var(--kami-accent); font-family: var(--kami-font-mono); }
html[data-kami-skin="terminal"] .kami-md blockquote {
  margin: .7em 0;
  padding: .2em 0 .2em 1em;
  border-left: 2px dashed var(--kami-accent);
  color: var(--kami-fg-dim);
}
html[data-kami-skin="terminal"] .kami-md code {
  padding: 1px 4px;
  background-color: var(--kami-t1);
  color: var(--kami-accent);
  font-family: var(--kami-font-mono);
}
html[data-kami-skin="terminal"] .kami-md pre {
  margin: .7em 0;
  padding: var(--kami-pad-y) var(--kami-pad-x);
  border: 1px solid var(--kami-line-strong);
  background-color: var(--kami-t2);
  overflow-x: auto;
  counter-reset: line;
}
html[data-kami-skin="terminal"] .kami-md pre code {
  padding: 0; background: none; border: 0; color: var(--kami-fg-dim);
}
html[data-kami-skin="terminal"] .kami-md hr {
  height: 1px;
  margin: 1em 0;
  border: 0;
  border-top: 1px dashed var(--kami-line-strong);
}
html[data-kami-skin="terminal"] .kami-md table { width: 100%; border-collapse: collapse; font-family: var(--kami-font-mono); font-size: var(--kami-fs-xs); }
html[data-kami-skin="terminal"] .kami-md th,
html[data-kami-skin="terminal"] .kami-md td {
  padding: 6px 10px;
  border: 1px solid var(--kami-line-strong);
  text-align: left;
}
html[data-kami-skin="terminal"] .kami-md th { color: var(--kami-accent); background-color: var(--kami-t1); }
html[data-kami-skin="terminal"] .kami-md img { max-width: 100%; border: 1px solid var(--kami-line-strong); }
`;
    fs.writeFileSync(termCssPath, termCss, 'utf8');
}

// 4. Mileng
let milengCssPath = 'src/skins/mileng/skin.css';
let milengCss = fs.readFileSync(milengCssPath, 'utf8');

if (!milengCss.includes('.kami-md')) {
    // Add styling from reference
    milengCss = milengCss.replace(/--kami-texture: (.*?);/g, '--kami-texture: $1, linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px); background-size: 100% 100%, 40px 40px, 40px 40px;');
    
    // Header clip-path, left border
    milengCss += `
/* Military Engineering Visuals */
html[data-kami-skin="mileng"] .kami-shell {
  border-left: 4px solid var(--kami-accent);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.5);
}
html[data-kami-skin="mileng"] .kami-head {
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: linear-gradient(90deg, var(--kami-t1) 0%, transparent 80%);
}
html[data-kami-skin="mileng"] .kami-card {
  border-radius: var(--kami-r-sm) var(--kami-r-sm) var(--kami-r-sm) var(--kami-r-sm);
}

/* MD */
html[data-kami-skin="mileng"] .kami-md {
  padding: var(--kami-pad-lg-y) var(--kami-pad-lg-x);
  border: 1px solid var(--kami-line);
  background-color: var(--kami-bg-soft);
  color: var(--kami-fg);
  font-size: var(--kami-fs-sm);
  text-wrap: pretty;
  overflow-wrap: anywhere;
}
html[data-kami-skin="mileng"] .kami-root[data-kami-comp="panel"] .kami-md {
  background-color: var(--kami-card-2);
  border-color: var(--kami-line);
  color: var(--kami-fg-dim);
}
html[data-kami-skin="mileng"] .kami-md > :first-child { margin-top: 0; }
html[data-kami-skin="mileng"] .kami-md > :last-child { margin-bottom: 0; }
html[data-kami-skin="mileng"] .kami-md p { margin: .6em 0; }
html[data-kami-skin="mileng"] .kami-md h1,
html[data-kami-skin="mileng"] .kami-md h2,
html[data-kami-skin="mileng"] .kami-md h3 {
  margin: 1em 0 .42em;
  font-family: var(--kami-font-title);
  font-weight: 800;
  text-transform: uppercase;
  color: var(--kami-accent);
  border-bottom: 2px solid var(--kami-accent);
  padding-bottom: .2em;
}
html[data-kami-skin="mileng"] .kami-md strong { font-weight: bold; color: var(--kami-accent-fg); background-color: var(--kami-accent); padding: 0 4px; border-radius: 2px; }
html[data-kami-skin="mileng"] .kami-md em { font-style: italic; color: var(--kami-fg-dim); }
html[data-kami-skin="mileng"] .kami-md a {
  color: var(--kami-accent);
  text-decoration: none;
  border-bottom: 1px solid var(--kami-accent);
}
html[data-kami-skin="mileng"] .kami-md ul,
html[data-kami-skin="mileng"] .kami-md ol { margin: .55em 0; padding-left: 2em; }
html[data-kami-skin="mileng"] .kami-md li { margin: .3em 0; }
html[data-kami-skin="mileng"] .kami-md ul { list-style: square; }
html[data-kami-skin="mileng"] .kami-md ul > li::marker { color: var(--kami-accent); }
html[data-kami-skin="mileng"] .kami-md ol { list-style: decimal; }
html[data-kami-skin="mileng"] .kami-md ol > li::marker { color: var(--kami-accent); font-weight: bold; }
html[data-kami-skin="mileng"] .kami-md blockquote {
  margin: .7em 0;
  padding: .5em 1em;
  border-left: 4px solid var(--kami-accent);
  background-color: var(--kami-t1);
  color: var(--kami-fg-dim);
  font-style: italic;
}
html[data-kami-skin="mileng"] .kami-md code {
  padding: 2px 4px;
  background-color: var(--kami-t2);
  border: 1px solid var(--kami-line);
  border-radius: 2px;
  font-family: var(--kami-font-mono);
  font-size: .86em;
  color: var(--kami-fg);
}
html[data-kami-skin="mileng"] .kami-md pre {
  margin: .7em 0;
  padding: var(--kami-pad-y) var(--kami-pad-x);
  border: 1px solid var(--kami-line-strong);
  background-color: #0c110d;
  overflow-x: auto;
  border-left: 4px solid var(--kami-accent);
}
html[data-kami-skin="mileng"] .kami-md pre code {
  padding: 0; background: none; border: 0; color: var(--kami-fg);
}
html[data-kami-skin="mileng"] .kami-md hr {
  height: 2px;
  margin: 1em 0;
  border: 0;
  background-color: var(--kami-line-strong);
}
html[data-kami-skin="mileng"] .kami-md table { width: 100%; border-collapse: collapse; font-family: var(--kami-font); font-size: var(--kami-fs-xs); }
html[data-kami-skin="mileng"] .kami-md th,
html[data-kami-skin="mileng"] .kami-md td {
  padding: 8px 10px;
  border: 1px solid var(--kami-line-strong);
  text-align: left;
}
html[data-kami-skin="mileng"] .kami-md th { color: var(--kami-accent); background-color: var(--kami-t2); font-weight: 800; text-transform: uppercase; }
html[data-kami-skin="mileng"] .kami-md img { max-width: 100%; border: 2px solid var(--kami-line-strong); }
`;
    fs.writeFileSync(milengCssPath, milengCss, 'utf8');
}
