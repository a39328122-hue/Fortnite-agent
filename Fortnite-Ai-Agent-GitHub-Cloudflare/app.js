(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const DB_CONFIG = window.FORTNITE_AI_DB || {};
  const USER_API_KEY_SESSION = "fortniteAiAgent.groqKey.session";
  const LOGIN_MODE_SESSION = "fortniteAiAgent.loginMode.session";
  const GROQ_KEYS_URL = "https://console.groq.com/keys";
  const STORAGE_KEY = "fortniteAiAgent.chats.v3";
  const ACTIVE_KEY = "fortniteAiAgent.active.v3";
  const GENERATED_FILE_NAME = "Subscribe to my YT channel @27lf.txt";

  const PLUGINS = [
    { id:"deep", label:"DeepResearch", command:"@DeepResearch", description:"Current multi-source Fortnite research", icon:"DR" },
    { id:"sm", label:"SearchForSM_", command:"@SearchForSM_", description:"Search Static Mesh paths", icon:"SM" },
    { id:"m", label:"SearchForM_", command:"@SearchForM_", description:"Search Materials and Material Instances", icon:"M" },
    { id:"meshes", label:"SearchForMeshes", command:"@SearchForMeshes", description:"Search mesh paths and references", icon:"MSH" },
    { id:"all", label:"SearchFortniteFiles", command:"@SearchFortniteFiles", description:"Search the full Fortnite database", icon:"ALL" }
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    sidebar:$("sidebar"), scrim:$("scrim"), openSidebar:$("openSidebar"), closeSidebar:$("closeSidebar"),
    newChatBtn:$("newChatBtn"), moreToolsBtn:$("moreToolsBtn"), discordTop:$("discordTop"),
    recentList:$("recentList"), chat:$("chat"), welcome:$("welcome"), messages:$("messages"),
    composer:$("composer"), input:$("messageInput"), send:$("sendButton"), toast:$("toast"),
    loginGate:$("loginGate")
  };

  const pluginMenu = document.createElement("div");
  pluginMenu.className = "plugin-menu";
  pluginMenu.hidden = true;
  document.body.appendChild(pluginMenu);

  let chats = loadChats();
  let activeId = localStorage.getItem(ACTIVE_KEY) || null;
  let busy = false;
  let toastTimer = null;
  let dbWorker = null;
  let dbSeq = 0;
  const dbPending = new Map();

  if (!activeId || !chats[activeId]) activeId = createChat(false);

  setupEvents();
  renderAll();
  maybeShowLoginGate();

  function setupEvents(){
    els.openSidebar.addEventListener("click", openSidebar);
    els.closeSidebar.addEventListener("click", closeSidebar);
    els.scrim.addEventListener("click", closeSidebar);

    els.newChatBtn.addEventListener("click", () => {
      activeId = createChat(true);
      renderAll();
      closeSidebar();
    });

    els.moreToolsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (window.FortniteTools?.open) {
        window.FortniteTools.open();
        requestAnimationFrame(closeSidebar);
      } else {
        showToast("More Tools failed to load", true);
      }
    });

    els.discordTop.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText("@its.swag"); showToast("Copied @its.swag"); }
      catch { showToast("@its.swag"); }
    });

    els.input.addEventListener("input", () => {
      resizeTextarea();
      updateSendState();
      updatePluginMenu();
    });
    els.input.addEventListener("focus", updatePluginMenu);
    els.input.addEventListener("click", updatePluginMenu);

    els.input.addEventListener("keydown", (event) => {
      if (!pluginMenu.hidden) {
        if (event.key === "Escape") { pluginMenu.hidden = true; return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          movePluginSelection(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          const selected = pluginMenu.querySelector(".plugin-option.selected");
          if (selected) {
            event.preventDefault();
            selectPlugin(selected.dataset.command || "");
            return;
          }
        }
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!els.send.disabled) els.composer.requestSubmit();
      }
    });

    els.composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendMessage();
    });

    document.addEventListener("pointerdown", (event) => {
      if (!pluginMenu.hidden && !pluginMenu.contains(event.target) && event.target !== els.input) {
        pluginMenu.hidden = true;
      }
    });

    window.addEventListener("resize", positionPluginMenu);
    window.addEventListener("orientationchange", () => setTimeout(positionPluginMenu, 120));
    if (window.visualViewport) {
      visualViewport.addEventListener("resize", positionPluginMenu);
      visualViewport.addEventListener("scroll", positionPluginMenu);
    }
  }

  function loadChats(){
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch { return {}; }
  }
  function saveChats(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    localStorage.setItem(ACTIVE_KEY, activeId);
  }
  function createChat(focus=true){
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    chats[id] = { id, title:"New chat", createdAt:Date.now(), updatedAt:Date.now(), messages:[] };
    activeId = id;
    saveChats();
    if (focus) setTimeout(() => els.input.focus(), 0);
    return id;
  }
  function currentChat(){ return chats[activeId]; }
  function titleFromMessage(text){
    const clean = String(text).replace(/\s+/g," ").trim();
    return clean.length > 42 ? clean.slice(0,42) + "..." : clean || "New chat";
  }

  function renderAll(){
    renderMessages();
    renderRecents();
    updateSendState();
  }
  function renderRecents(){
    els.recentList.replaceChildren();
    Object.values(chats)
      .filter(c => c.messages.length)
      .sort((a,b) => b.updatedAt-a.updatedAt)
      .slice(0,30)
      .forEach(chat => {
        const b = document.createElement("button");
        b.type="button"; b.className=`recent-item${chat.id===activeId?" current":""}`;
        b.textContent=chat.title;
        b.addEventListener("click", () => {
          activeId=chat.id; saveChats(); renderAll(); closeSidebar(); scrollToBottom();
        });
        els.recentList.appendChild(b);
      });
  }
  function renderMessages(){
    const chat=currentChat();
    els.messages.replaceChildren();
    const has=chat?.messages?.length>0;
    els.welcome.hidden=has;
    if(!has) return;
    chat.messages.forEach(m => els.messages.appendChild(createMessageNode(m)));
    requestAnimationFrame(scrollToBottom);
  }
  function createMessageNode(message){
    const outer=document.createElement("article");
    outer.className=`message ${message.role}`;
    if(message.role==="user"){
      const bubble=document.createElement("div");
      bubble.className="user-bubble";
      bubble.textContent=message.content;
      outer.appendChild(bubble);
      return outer;
    }
    const wrap=document.createElement("div");
    wrap.className="assistant-wrap";
    const name=document.createElement("div");
    name.className="assistant-name";
    name.textContent="Fortnite Ai Agent";
    const content=document.createElement("div");
    content.className="assistant-content";
    renderMarkdown(content,message.content);
    wrap.append(name,content);
    if(message.attachment?.content) appendGeneratedFile(wrap,message.attachment);
    outer.appendChild(wrap);
    return outer;
  }

  function renderMarkdown(container,source){
    container.replaceChildren();
    const lines=String(source||"").replace(/\r\n?/g,"\n").split("\n");
    let i=0;
    while(i<lines.length){
      const line=lines[i];
      if(/^```/.test(line)){
        const language=line.replace(/^```/,"").trim()||"text";
        const code=[]; i++;
        while(i<lines.length&&!/^```/.test(lines[i])) code.push(lines[i++]);
        if(i<lines.length) i++;
        appendCodeBlock(container,code.join("\n"),language);
        continue;
      }
      if(!line.trim()){ i++; continue; }
      const h=line.match(/^(#{1,3})\s+(.+)$/);
      if(h){
        const el=document.createElement(`h${h[1].length}`);
        appendInline(el,h[2]); container.appendChild(el); i++; continue;
      }
      if(/^\s*[-+*]\s+/.test(line)){
        const ul=document.createElement("ul");
        while(i<lines.length&&/^\s*[-+*]\s+/.test(lines[i])){
          const li=document.createElement("li");
          appendInline(li,lines[i].replace(/^\s*[-+*]\s+/,""));
          ul.appendChild(li); i++;
        }
        container.appendChild(ul); continue;
      }
      const p=document.createElement("p");
      appendInline(p,line); container.appendChild(p); i++;
    }
  }
  function appendInline(parent,text){
    const re=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
    let last=0,m;
    while((m=re.exec(text))!==null){
      if(m.index>last) parent.append(document.createTextNode(text.slice(last,m.index)));
      const token=m[0];
      if(token.startsWith("`")){
        const e=document.createElement("code"); e.className="inline-code"; e.textContent=token.slice(1,-1); parent.append(e);
      }else if(token.startsWith("**")){
        const e=document.createElement("strong"); e.textContent=token.slice(2,-2); parent.append(e);
      }else{
        const lm=token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if(lm){ const a=document.createElement("a"); a.textContent=lm[1]; a.href=lm[2]; a.target="_blank"; a.rel="noopener noreferrer"; parent.append(a); }
      }
      last=re.lastIndex;
    }
    if(last<text.length) parent.append(document.createTextNode(text.slice(last)));
  }
  function appendCodeBlock(container,code,language){
    const box=document.createElement("div"); box.className="code-block";
    const head=document.createElement("div"); head.className="code-head";
    const lang=document.createElement("span"); lang.textContent=language||"text";
    const copy=document.createElement("button"); copy.type="button"; copy.className="copy-button"; copy.textContent="Copy";
    copy.addEventListener("click",async()=>{ try{await navigator.clipboard.writeText(code);copy.textContent="Copied";setTimeout(()=>copy.textContent="Copy",900)}catch{} });
    const pre=document.createElement("pre"), ce=document.createElement("code"); ce.textContent=code; pre.append(ce);
    head.append(lang,copy); box.append(head,pre); container.append(box);
  }
  function appendGeneratedFile(parent,attachment){
    const card=document.createElement("div"); card.className="generated-file-card";
    const icon=document.createElement("div"); icon.className="generated-file-icon"; icon.textContent="TXT";
    const meta=document.createElement("div"); meta.className="generated-file-meta";
    const name=document.createElement("div"); name.className="generated-file-name"; name.textContent=GENERATED_FILE_NAME;
    const type=document.createElement("div"); type.className="generated-file-type"; type.textContent="Text file";
    const dl=document.createElement("button"); dl.type="button"; dl.className="generated-file-download"; dl.textContent="Download";
    dl.addEventListener("click",()=>{
      const blob=new Blob([attachment.content],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob); const a=document.createElement("a");
      a.href=url;a.download=GENERATED_FILE_NAME;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1200);
    });
    meta.append(name,type);card.append(icon,meta,dl);parent.append(card);
  }

  async function sendMessage(){
    if(busy) return;
    const text=els.input.value.trim();
    if(!text) return;
    const chat=currentChat();
    if(!chat.messages.length) chat.title=titleFromMessage(text);
    chat.messages.push({role:"user",content:text});chat.updatedAt=Date.now();saveChats();
    els.input.value="";resizeTextarea();pluginMenu.hidden=true;renderAll();setBusy(true);addTypingIndicator();

    const plugin=parsePlugin(text);
    try{
      if(plugin&&["sm","m","meshes","all"].includes(plugin.id)){
        const result=await searchDatabase(plugin.id,plugin.query);
        removeTypingIndicator();
        const reply=formatDatabaseResult(plugin,result);
        const msg={role:"assistant",content:reply.content};
        if(reply.attachment) msg.attachment=reply.attachment;
        chat.messages.push(msg);
      }else{
        const mode=plugin?.id==="deep"?"deep-research":"chat";
        const response=await fetchWithTimeout(API_ENDPOINT,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            mode,
            messages:chat.messages.slice(-12),
            apiKey:sessionStorage.getItem(USER_API_KEY_SESSION)||null
          })
        },45000);
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||`Request failed (${response.status})`);
        removeTypingIndicator();
        chat.messages.push({role:"assistant",content:String(data.reply||"").trim()||"No response."});
      }
      chat.updatedAt=Date.now();saveChats();renderAll();
    }catch(error){
      removeTypingIndicator();
      chat.messages.push({role:"assistant",content:`I couldn't complete that request.\n\n\`${String(error?.message||error)}\``});
      chat.updatedAt=Date.now();saveChats();renderAll();
    }finally{
      setBusy(false);
      els.input.focus({preventScroll:true});
    }
  }

  function parsePlugin(text){
    const value=String(text||"").trim();
    for(const p of PLUGINS){
      if(value.toLowerCase().startsWith(p.command.toLowerCase())){
        return {id:p.id,command:p.command,query:value.slice(p.command.length).trim()};
      }
    }
    return null;
  }
  function formatDatabaseResult(plugin,result){
    if(!plugin.query) return {content:`Type what u want to search after \`${plugin.command}\`.`};
    if(!result?.results?.length) return {content:`I searched the Fortnite database for \`${plugin.query}\` and couldn't find a close result.`};
    const exact=result.results.filter(r=>r.match==="exact").length;
    let content=exact
      ?`Found **${result.total}** result${result.total===1?"":"s"}.\n\n`
      :`No exact match for \`${plugin.query}\`, but i found close results:\n\n`;
    content+=result.results.slice(0,22).map(r=>`${r.source==="json"?"**JSON reference**\n":""}\`\`\`text\n${r.path}\n\`\`\``).join("\n\n");
    let attachment=null;
    if(result.makeFile&&result.allResults?.length){
      content+="\n\nFull result list:";
      attachment={name:GENERATED_FILE_NAME,content:result.allResults.map((r,i)=>`${i+1}. [${r.match.toUpperCase()}] [${r.source}] ${r.path}`).join("\n")};
    }
    return {content,attachment};
  }

  function ensureDbWorker(){
    if(dbWorker) return dbWorker;
    dbWorker=new Worker("./database-worker.js");
    dbWorker.addEventListener("message",(event)=>{
      const {id,ok,data,error}=event.data||{};
      const p=dbPending.get(id); if(!p)return; dbPending.delete(id);
      ok?p.resolve(data):p.reject(new Error(error||"Database worker error"));
    });
    dbWorker.addEventListener("error",(event)=>{
      for(const p of dbPending.values()) p.reject(new Error(event.message||"Database worker crashed"));
      dbPending.clear();dbWorker?.terminate();dbWorker=null;
    });
    return dbWorker;
  }
  function searchDatabase(scope,query){
    const worker=ensureDbWorker(),id=++dbSeq;
    return new Promise((resolve,reject)=>{
      dbPending.set(id,{resolve,reject});
      worker.postMessage({id,type:"search",scope,query,config:DB_CONFIG});
      setTimeout(()=>{if(!dbPending.has(id))return;dbPending.delete(id);reject(new Error("Database search timed out."));},30000);
    });
  }

  function updatePluginMenu(){
    const value=String(els.input.value||"");
    const caret=els.input.selectionStart??value.length;
    const before=value.slice(0,caret);
    const at=before.lastIndexOf("@");
    if(at<0){pluginMenu.hidden=true;return;}
    const between=before.slice(at+1);
    if(/\s/.test(between)){pluginMenu.hidden=true;return;}
    const q=between.toLowerCase();
    const visible=PLUGINS.filter(p=>!q||`${p.label} ${p.command} ${p.description}`.toLowerCase().includes(q));
    if(!visible.length){pluginMenu.hidden=true;return;}

    pluginMenu.replaceChildren();
    const header=document.createElement("div");header.className="plugin-panel-header";
    const title=document.createElement("strong");title.textContent="Plugins";
    const badge=document.createElement("span");badge.className="plugin-panel-badge";badge.textContent="Fortnite";
    header.append(title,badge);pluginMenu.append(header);

    visible.forEach((p,index)=>{
      const b=document.createElement("button");b.type="button";b.className=`plugin-option${index===0?" selected":""}`;b.dataset.command=p.command;
      const icon=document.createElement("span");icon.className="plugin-icon";icon.textContent=p.icon;
      const info=document.createElement("span");info.className="plugin-info";
      const t=document.createElement("span");t.className="plugin-title";t.textContent=`@${p.label}`;
      const d=document.createElement("small");d.textContent=p.description;
      info.append(t,d);b.append(icon,info);
      b.addEventListener("click",(e)=>{e.preventDefault();selectPlugin(p.command);});
      pluginMenu.append(b);
    });
    pluginMenu.hidden=false;
    requestAnimationFrame(positionPluginMenu);
  }

  function positionPluginMenu(){
    if(pluginMenu.hidden)return;
    const vv=window.visualViewport;
    const viewTop=vv?vv.offsetTop:0;
    const viewHeight=vv?vv.height:window.innerHeight;
    const viewBottom=viewTop+viewHeight;
    const composerRect=els.composer.getBoundingClientRect();
    const innerRect=els.composer.querySelector(".composer-inner")?.getBoundingClientRect()||composerRect;
    const margin=9;

    const width=Math.min(500,Math.max(260,innerRect.width));
    pluginMenu.style.width=`${Math.min(width,window.innerWidth-margin*2)}px`;
    const left=Math.max(margin,Math.min(innerRect.left,window.innerWidth-pluginMenu.offsetWidth-margin));
    pluginMenu.style.left=`${left}px`;

    const anchorTop=Math.min(composerRect.top,viewBottom-58);
    const room=Math.max(140,anchorTop-viewTop-margin*2);
    pluginMenu.style.maxHeight=`${Math.min(330,room)}px`;

    const menuHeight=Math.min(pluginMenu.scrollHeight,parseFloat(pluginMenu.style.maxHeight)||330);
    const top=Math.max(viewTop+margin,anchorTop-menuHeight-7);
    pluginMenu.style.top=`${top}px`;
  }

  function movePluginSelection(dir){
    const options=[...pluginMenu.querySelectorAll(".plugin-option")];
    if(!options.length)return;
    let i=options.findIndex(x=>x.classList.contains("selected"));
    if(i<0)i=0;options[i].classList.remove("selected");
    i=(i+dir+options.length)%options.length;
    options[i].classList.add("selected");options[i].scrollIntoView({block:"nearest"});
  }
  function selectPlugin(command){
    const value=els.input.value;
    const caret=els.input.selectionStart??value.length;
    const before=value.slice(0,caret),after=value.slice(caret),at=before.lastIndexOf("@");
    const start=at>=0?at:caret;
    const next=before.slice(0,start)+command+" "+after;
    els.input.value=next;
    const pos=before.slice(0,start).length+command.length+1;
    els.input.setSelectionRange(pos,pos);
    pluginMenu.hidden=true;resizeTextarea();updateSendState();els.input.focus({preventScroll:true});
  }

  function resizeTextarea(){
    els.input.style.height="auto";
    els.input.style.height=Math.min(140,els.input.scrollHeight)+"px";
    if(!pluginMenu.hidden) requestAnimationFrame(positionPluginMenu);
  }
  function updateSendState(){els.send.disabled=busy||!els.input.value.trim();}
  function setBusy(v){busy=v;updateSendState();}
  function addTypingIndicator(){
    removeTypingIndicator();
    const a=document.createElement("article");a.id="typingIndicator";a.className="message assistant";
    a.innerHTML='<div class="assistant-wrap"><div class="assistant-name">Fortnite Ai Agent</div><div class="assistant-content"><p>Thinking...</p></div></div>';
    els.messages.append(a);scrollToBottom();
  }
  function removeTypingIndicator(){$("typingIndicator")?.remove();}
  function scrollToBottom(){els.chat.scrollTop=els.chat.scrollHeight;}
  function openSidebar(){els.sidebar.classList.add("open");els.scrim.classList.add("show");els.sidebar.setAttribute("aria-hidden","false");}
  function closeSidebar(){els.sidebar.classList.remove("open");els.scrim.classList.remove("show");els.sidebar.setAttribute("aria-hidden","true");}
  function showToast(text,isError=false){
    clearTimeout(toastTimer);els.toast.textContent=text;els.toast.classList.toggle("error",isError);els.toast.classList.add("show");
    toastTimer=setTimeout(()=>els.toast.classList.remove("show"),1700);
  }
  async function fetchWithTimeout(url,options,ms){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
    try{return await fetch(url,{...options,signal:c.signal});}finally{clearTimeout(t);}
  }

  function maybeShowLoginGate(){
    const mode=sessionStorage.getItem(LOGIN_MODE_SESSION);
    if(mode==="guest"||mode==="api") return;
    showWelcomeGate();
  }
  function showWelcomeGate(){
    els.loginGate.hidden=false;
    els.loginGate.innerHTML=`
      <div class="login-card">
        <h1>Fortnite Ai Agent</h1>
        <p>Use your own Groq key or continue as Guest.</p>
        <button class="login-primary" id="loginOwnKey" type="button">Log in</button>
        <button class="login-secondary" id="loginGuest" type="button">Guest</button>
      </div>`;
    $("loginOwnKey").addEventListener("click",showApiLogin);
    $("loginGuest").addEventListener("click",()=>{
      sessionStorage.setItem(LOGIN_MODE_SESSION,"guest");sessionStorage.removeItem(USER_API_KEY_SESSION);
      els.loginGate.hidden=true;window.dispatchEvent(new Event("fortnite-login-mode-changed"));
    });
  }
  function showApiLogin(){
    els.loginGate.hidden=false;
    els.loginGate.innerHTML=`
      <div class="login-card">
        <button class="login-back" id="apiBack" type="button">‹</button>
        <h1>Type ur API</h1>
        <p>Groq key only. It stays in this browser session.</p>
        <div class="api-input-wrap">
          <input id="apiKeyInput" type="password" placeholder="gsk_..." autocomplete="off" />
          <button id="apiToggle" class="api-toggle" type="button">Show</button>
        </div>
        <button id="apiSave" class="login-primary" type="button">Continue</button>
        <button id="apiCreate" class="login-secondary" type="button">Create one for free from Groq API</button>
      </div>`;
    const input=$("apiKeyInput");
    $("apiBack").addEventListener("click",showWelcomeGate);
    $("apiToggle").addEventListener("click",()=>{
      input.type=input.type==="password"?"text":"password";
      $("apiToggle").textContent=input.type==="password"?"Show":"Hide";
    });
    $("apiCreate").addEventListener("click",()=>window.open(GROQ_KEYS_URL,"_blank","noopener"));
    $("apiSave").addEventListener("click",()=>{
      const key=input.value.trim();
      if(!/^gsk_[A-Za-z0-9_-]{10,}$/.test(key)){showToast("That doesn't look like a Groq key.",true);return;}
      sessionStorage.setItem(USER_API_KEY_SESSION,key);sessionStorage.setItem(LOGIN_MODE_SESSION,"api");
      els.loginGate.hidden=true;window.dispatchEvent(new Event("fortnite-login-mode-changed"));
    });
  }

  window.FortniteAgent={searchDatabase,showApiLogin,showToast};
})();
