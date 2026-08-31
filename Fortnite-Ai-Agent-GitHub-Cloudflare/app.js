(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const DB_CONFIG = window.FORTNITE_AI_DB || {};
  const LOGIN_MODE_SESSION = "fortniteAiAgent.loginMode.session";
  const STORAGE_KEY = "fortniteAiAgent.chats.v3";
  const ACTIVE_KEY = "fortniteAiAgent.active.v3";
  const GENERATED_FILE_NAME = "Subscribe to my YT channel @27lf.txt";
  const THEME_KEY = "fortniteAiAgent.theme.v1";
  const DEFAULT_USER_AVATAR = "./assets/default-user-avatar.jpeg";

  const PLUGINS = [
    { id:"deep", label:"DeepResearch", command:"@DeepResearch", description:"Current multi-source Fortnite research", icon:"DR" },
    { id:"sm", label:"SearchForSM_", command:"@SearchForSM_", description:"Search Static Mesh paths", icon:"SM" },
    { id:"m", label:"SearchForM_", command:"@SearchForM_", description:"Search Materials and Material Instances", icon:"M" },
    { id:"meshes", label:"SearchForMeshes", command:"@SearchForMeshes", description:"Search mesh paths and references", icon:"MSH" },
    { id:"all", label:"SearchFortniteFiles", command:"@SearchFortniteFiles", description:"Search the full Fortnite database", icon:"ALL" }
  ];

  const $ = (id) => document.getElementById(id);
  const escapeAttr = (value) => String(value ?? "").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[ch]));
  const els = {
    sidebar:$("sidebar"), scrim:$("scrim"), openSidebar:$("openSidebar"), closeSidebar:$("closeSidebar"),
    newChatBtn:$("newChatBtn"), moreToolsBtn:$("moreToolsBtn"), settingsBtn:$("settingsBtn"), discordTop:$("discordTop"),
    recentList:$("recentList"), chat:$("chat"), welcome:$("welcome"), messages:$("messages"),
    composer:$("composer"), input:$("messageInput"), send:$("sendButton"), toast:$("toast"),
    loginGate:$("loginGate"), settingsOverlay:$("settingsOverlay"), settingsBackBtn:$("settingsBackBtn"),
    profileAvatarButton:$("profileAvatarButton"), profileAvatar:$("profileAvatar"),
    profileUsernameButton:$("profileUsernameButton"), profileAccountType:$("profileAccountType"),
    profileAvatarInput:$("profileAvatarInput"), accountActionButton:$("accountActionButton")
  };

  const pluginMenu = document.createElement("div");
  pluginMenu.className = "plugin-menu";
  pluginMenu.hidden = true;
  els.composer.appendChild(pluginMenu);

  let chats = loadChats();
  let activeId = localStorage.getItem(ACTIVE_KEY) || null;
  let busy = false;
  let toastTimer = null;
  let dbWorker = null;
  let dbSeq = 0;
  let accountState = { configured:false, user:null, profile:null, error:null };
  let pendingSetupAvatar = "";
  const dbPending = new Map();

  if (!activeId || !chats[activeId]) activeId = createChat(false);

  applyTheme(localStorage.getItem(THEME_KEY) || "fortnite");
  setupEvents();
  renderAll();
  maybeShowLoginGate();
  syncVisualViewport();

  window.addEventListener("pageshow",()=>{
    // Browsers can restore this page from back-forward cache after backing out of OpenRouter.
    resetOpenRouterButton();
  });

  function syncVisualViewport(){
    const vv=window.visualViewport;
    const height=Math.round(vv?.height||window.innerHeight);
    const top=Math.round(vv?.offsetTop||0);

    document.documentElement.style.setProperty("--app-height",`${height}px`);
    document.documentElement.style.setProperty("--app-top",`${top}px`);
  }

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

    els.settingsBtn.addEventListener("click",(event)=>{
      event.preventDefault();
      event.stopPropagation();
      closeSidebar();
      openSettings();
    });

    els.settingsBackBtn.addEventListener("click",closeSettings);

    els.profileUsernameButton?.addEventListener("click",()=>{
      if(!accountState.user){ showWelcomeGate(); return; }
      showUsernameEditor();
    });

    els.profileAvatarButton?.addEventListener("click",()=>{
      if(!accountState.user){ showWelcomeGate(); return; }
      els.profileAvatarInput?.click();
    });

    els.profileAvatarInput?.addEventListener("change",async()=>{
      const file=els.profileAvatarInput.files?.[0];
      els.profileAvatarInput.value="";
      if(!file)return;
      try{
        const dataUrl=await processAvatarFile(file);
        await window.FortniteAuth?.saveAvatar(dataUrl);
        showToast("Profile picture updated");
      }catch(error){ showToast(String(error?.message||error),true); }
    });

    els.accountActionButton?.addEventListener("click",async()=>{
      if(accountState.user){
        try{
          await window.FortniteAuth?.signOut();
          sessionStorage.removeItem(LOGIN_MODE_SESSION);
          closeSettings();
          showWelcomeGate();
        }catch(error){ showToast(String(error?.message||error),true); }
      }else{
        closeSettings();
        showWelcomeGate();
      }
    });

    document.addEventListener("click",(event)=>{
      const themeButton=event.target.closest("[data-theme-choice]");
      if(!themeButton)return;
      applyTheme(themeButton.dataset.themeChoice);
    });

    window.addEventListener("fortnite-auth-changed",(event)=>{
      handleAuthState(event.detail||{});
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

    const handleViewportChange=()=>{
      syncVisualViewport();
      positionPluginMenu();
    };

    window.addEventListener("resize",handleViewportChange);
    window.addEventListener("orientationchange",()=>setTimeout(handleViewportChange,120));

    if(window.visualViewport){
      visualViewport.addEventListener("resize",handleViewportChange);
      visualViewport.addEventListener("scroll",handleViewportChange);
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
    name.className="assistant-name assistant-brand";

    const avatar=document.createElement("img");
    avatar.className="assistant-avatar";
    avatar.src="./assets/fnaa-avatar.jpeg";
    avatar.alt="";

    const brandText=document.createElement("span");
    brandText.textContent="Fortnite Ai Agent";

    name.append(avatar,brandText);
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
          headers:{"Content-Type":"application/json","X-FNAA-Client":"web-v1"},
          body:JSON.stringify({
            mode,
            messages:chat.messages.slice(-12)
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
    const visibleHeight=vv?.height||window.innerHeight;
    const maxHeight=Math.max(150,Math.min(320,visibleHeight*0.46));

    pluginMenu.style.maxHeight=`${maxHeight}px`;
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
    a.innerHTML='<div class="assistant-wrap"><div class="assistant-name assistant-brand"><img class="assistant-avatar" src="./assets/fnaa-avatar.jpeg" alt="" /><span>Fortnite Ai Agent</span></div><div class="assistant-content"><p>Thinking...</p></div></div>';
    els.messages.append(a);scrollToBottom();
  }
  function removeTypingIndicator(){$("typingIndicator")?.remove();}
  function scrollToBottom(){els.chat.scrollTop=els.chat.scrollHeight;}
  function openSettings(){
    renderAccountUI();
    syncThemeButtons();
    els.settingsOverlay.hidden=false;
    els.settingsOverlay.setAttribute("aria-hidden","false");
    window.FortniteI18n?.apply(els.settingsOverlay);
  }

  function closeSettings(){
    els.settingsOverlay.hidden=true;
    els.settingsOverlay.setAttribute("aria-hidden","true");
  }

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

  async function maybeShowLoginGate(){
    const guestMode=sessionStorage.getItem(LOGIN_MODE_SESSION)==="guest";
    if(guestMode){
      handleAuthState({ configured:true, user:null, profile:null });
      return;
    }

    try{
      await Promise.race([
        window.FORTNITE_AUTH_READY,
        new Promise((resolve)=>setTimeout(resolve,5000))
      ]);
    }catch{}
    const state=window.FortniteAuth?.getState?.()||{};
    handleAuthState(state);

    if(state.user){
      els.loginGate.hidden=true;
      if(state.profile && state.profile.setupComplete===false){
        window.FortniteAuth?.skipSetup?.().catch(()=>{});
      }
      return;
    }

    showWelcomeGate();
  }

  function handleAuthState(detail){
    accountState={
      configured:detail.configured!==false,
      user:detail.user||null,
      profile:detail.profile||null,
      error:detail.error||null
    };

    if(accountState.user){
      sessionStorage.setItem(LOGIN_MODE_SESSION,"openrouter");
      els.loginGate.hidden=true;
      if(accountState.profile?.setupComplete===false){
        window.FortniteAuth?.skipSetup?.().catch(()=>{});
      }
    }else if(sessionStorage.getItem(LOGIN_MODE_SESSION)==="openrouter"){
      sessionStorage.removeItem(LOGIN_MODE_SESSION);
      if(els.loginGate.hidden) showWelcomeGate();
    }

    renderAccountUI();
    window.dispatchEvent(new Event("fortnite-login-mode-changed"));
  }

  function continueAsGuest(){
    sessionStorage.setItem(LOGIN_MODE_SESSION,"guest");
    accountState={ configured:true, user:null, profile:null, error:null };
    els.loginGate.hidden=true;
    renderAccountUI();
    window.dispatchEvent(new Event("fortnite-login-mode-changed"));
  }

  function showWelcomeGate(){
    els.loginGate.hidden=false;
    els.loginGate.innerHTML=`
      <div class="login-card login-card-polished fnaa-login-simple">
        <h1 class="login-brand brand-with-avatar">
          <img class="brand-avatar login-brand-avatar" src="./assets/fnaa-avatar.jpeg" alt="" />
          <span>Fortnite Ai Agent</span>
        </h1>
        <p class="fnaa-login-provider-note">Sign in with OpenRouter.</p>

        <button class="login-primary openrouter-login-button" id="loginMain" type="button">
          Continue with OpenRouter
        </button>
        <div id="openRouterLoginStatus" class="fnaa-login-status" role="status" aria-live="polite"></div>

        <div class="login-inline-text login-guest-line">
          <span data-i18n="continueAs">Continue as a</span>
          <button class="login-link-button" id="loginGuest" type="button" data-i18n="guest">guest</button>
        </div>
      </div>`;
    window.FortniteI18n?.apply(els.loginGate);
    $("loginMain").addEventListener("click",showOpenRouterLogin);
    $("loginGuest").addEventListener("click",continueAsGuest);

    const authState=window.FortniteAuth?.getState?.()||{};
    if(authState.error){
      const status=$("openRouterLoginStatus");
      if(status){
        status.textContent=friendlyAuthError(authState.error);
        status.classList.add("error");
      }
    }
  }

  function resetOpenRouterButton(){
    const button=$("loginMain");
    if(!button)return;
    button.disabled=false;
    button.textContent="Continue with OpenRouter";
  }

  async function showOpenRouterLogin(){
    const api=window.FortniteAuth;
    const button=$("loginMain");
    const status=$("openRouterLoginStatus");

    if(!api?.configured){
      if(status){
        status.textContent="Account login is temporarily unavailable.";
        status.classList.add("error");
      }
      return;
    }

    if(button){
      button.disabled=true;
      button.textContent="Opening OpenRouter…";
    }
    if(status){
      status.classList.remove("error");
      status.textContent="";
    }

    try{
      await api.signInDefault();
    }catch(error){
      resetOpenRouterButton();
      if(status){
        status.textContent=friendlyAuthError(error);
        status.classList.add("error");
      }else{
        showToast(friendlyAuthError(error),true);
      }
    }
  }

  // Compatibility alias for old callers.
  function showGoogleLogin(){ return showOpenRouterLogin(); }

  function friendlyAuthError(error){
    const raw=String(error?.message||error||"");
    if(/cancel/i.test(raw)) return "OpenRouter authorization was cancelled.";
    if(/expired/i.test(raw)) return "OpenRouter login expired. Try again.";
    if(/timeout|AbortError|LOGIN_TIMEOUT/i.test(raw)) return "OpenRouter took too long to respond. Try again.";
    return "OpenRouter login is temporarily unavailable. Try again or continue as guest.";
  }

  function showSetupChoice(){
    if(!accountState.user)return;
    els.loginGate.hidden=false;
    els.loginGate.innerHTML=`
      <div class="login-card login-card-polished setup-choice-card">
        <img class="setup-avatar" src="${profileAvatarSrc()}" alt="" />
        <h1 data-i18n="setupQuestion">Do u want to continue Account set up?</h1>
        <button id="setupSure" class="login-primary" type="button" data-i18n="sure">Sure</button>
        <button id="setupNo" class="login-secondary" type="button" data-i18n="no">No</button>
      </div>`;
    window.FortniteI18n?.apply(els.loginGate);
    $("setupSure").addEventListener("click",showProfileSetup);
    $("setupNo").addEventListener("click",async()=>{
      try{
        await window.FortniteAuth?.skipSetup();
        els.loginGate.hidden=true;
      }catch(error){showToast(String(error?.message||error),true);}
    });
  }

  function showProfileSetup(){
    pendingSetupAvatar=accountState.profile?.avatar||"";
    const username=accountState.profile?.username||"user0000";
    els.loginGate.hidden=false;
    els.loginGate.innerHTML=`
      <div class="login-card login-card-polished profile-setup-card">
        <button class="login-back" id="setupBack" type="button" aria-label="Back">‹</button>
        <h1 data-i18n="accountSetup">Account set up</h1>
        <button id="setupAvatarPick" class="setup-avatar-picker" type="button">
          <img id="setupAvatarPreview" class="setup-avatar" src="${pendingSetupAvatar||DEFAULT_USER_AVATAR}" alt="" />
          <span data-i18n="choosePhoto">Choose photo</span>
        </button>
        <input id="setupAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden />
        <label class="profile-field-label" for="setupUsername" data-i18n="username">Username</label>
        <input id="setupUsername" class="profile-username-input" value="${escapeAttr(username)}" placeholder="Type Whatever u want" maxlength="9" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <div class="username-counter"><span id="setupCount">${Array.from(username).length}</span>/9</div>
        <button id="setupSave" class="login-primary" type="button" data-i18n="save">Save</button>
      </div>`;
    window.FortniteI18n?.apply(els.loginGate);

    const input=$("setupUsername"), count=$("setupCount"), fileInput=$("setupAvatarInput"), preview=$("setupAvatarPreview");
    enforceNineChars(input,count);
    $("setupBack").addEventListener("click",showSetupChoice);
    $("setupAvatarPick").addEventListener("click",()=>fileInput.click());
    fileInput.addEventListener("change",async()=>{
      const file=fileInput.files?.[0]; fileInput.value=""; if(!file)return;
      try{ pendingSetupAvatar=await processAvatarFile(file); preview.src=pendingSetupAvatar; }
      catch(error){showToast(String(error?.message||error),true);}
    });
    $("setupSave").addEventListener("click",async()=>{
      try{
        await window.FortniteAuth?.finishSetup({username:input.value,avatar:pendingSetupAvatar});
        els.loginGate.hidden=true;
        renderAccountUI();
      }catch(error){showToast(String(error?.message||error),true);}
    });
  }

  function showUsernameEditor(){
    if(!accountState.user)return showWelcomeGate();
    const current=accountState.profile?.username||"";
    els.loginGate.hidden=false;
    els.loginGate.innerHTML=`
      <div class="login-card login-card-polished username-edit-card">
        <button class="login-back" id="usernameBack" type="button" aria-label="Back">‹</button>
        <h1 data-i18n="changeUsername">Change username</h1>
        <p data-i18n="usernameHint">Type Whatever u want — 9 characters max.</p>
        <input id="usernameEditInput" class="profile-username-input" value="${escapeAttr(current)}" placeholder="Type Whatever u want" maxlength="9" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <div class="username-counter"><span id="usernameEditCount">${Array.from(current).length}</span>/9</div>
        <button id="usernameSave" class="login-primary" type="button" data-i18n="save">Save</button>
      </div>`;
    window.FortniteI18n?.apply(els.loginGate);
    const input=$("usernameEditInput"),count=$("usernameEditCount");
    enforceNineChars(input,count);
    $("usernameBack").addEventListener("click",()=>{els.loginGate.hidden=true;});
    $("usernameSave").addEventListener("click",async()=>{
      try{
        await window.FortniteAuth?.saveUsername(input.value);
        els.loginGate.hidden=true;
        renderAccountUI();
        showToast("Username updated");
      }catch(error){showToast(String(error?.message||error),true);}
    });
  }

  function enforceNineChars(input,counter){
    input.addEventListener("input",()=>{
      const chars=Array.from(input.value);
      if(chars.length>9)input.value=chars.slice(0,9).join("");
      counter.textContent=String(Array.from(input.value).length);
    });
  }

  function profileAvatarSrc(){
    return accountState.profile?.avatar||DEFAULT_USER_AVATAR;
  }

  function renderAccountUI(){
    if(!els.profileAvatar)return;
    const loggedIn=!!accountState.user;
    const username=loggedIn?(accountState.profile?.username||"User"):"Guest";
    els.profileAvatar.src=loggedIn?profileAvatarSrc():DEFAULT_USER_AVATAR;
    els.profileUsernameButton.textContent=`@${username}`;
    els.profileAccountType.textContent=loggedIn?"OpenRouter account":"Guest";
    els.accountActionButton.textContent=loggedIn?"Sign out":"Log in";
    els.profileAvatarButton.classList.toggle("profile-locked",!loggedIn);
    els.profileUsernameButton.classList.toggle("profile-locked",!loggedIn);
  }

  async function processAvatarFile(file){
    if(!file)throw new Error("Choose an image first.");
    const allowed=new Set(["image/jpeg","image/png","image/webp"]);
    if(!allowed.has(file.type))throw new Error("Use JPG, PNG or WEBP only.");
    if(file.size>3*1024*1024)throw new Error("Image must be 3 MB or less.");

    const url=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(new Error("Couldn't read that image."));
        img.src=url;
      });
      if(!image.naturalWidth||!image.naturalHeight)throw new Error("Invalid image.");
      if(image.naturalWidth>6000||image.naturalHeight>6000)throw new Error("Image dimensions are too large.");

      const size=Math.min(image.naturalWidth,image.naturalHeight);
      const sx=Math.floor((image.naturalWidth-size)/2);
      const sy=Math.floor((image.naturalHeight-size)/2);
      const canvas=document.createElement("canvas");
      canvas.width=256;canvas.height=256;
      const ctx=canvas.getContext("2d",{alpha:false});
      if(!ctx)throw new Error("Image processing isn't available.");
      ctx.drawImage(image,sx,sy,size,size,0,0,256,256);
      let dataUrl=canvas.toDataURL("image/jpeg",0.84);
      if(dataUrl.length>175000)dataUrl=canvas.toDataURL("image/jpeg",0.68);
      if(dataUrl.length>180000)throw new Error("Image is still too large after processing.");
      return dataUrl;
    }finally{URL.revokeObjectURL(url);}
  }

  function applyTheme(theme){
    const allowed=new Set(["black","white","fortnite"]);
    const next=allowed.has(theme)?theme:"fortnite";
    document.documentElement.dataset.theme=next;
    localStorage.setItem(THEME_KEY,next);
    const themeMeta=document.querySelector("meta[name=theme-color]");
    if(themeMeta)themeMeta.setAttribute("content",next==="white"?"#f5f5f5":next==="fortnite"?"#06130f":"#000000");
    syncThemeButtons();
  }

  function syncThemeButtons(){
    const active=document.documentElement.dataset.theme||"fortnite";
    document.querySelectorAll("[data-theme-choice]").forEach((button)=>{
      button.classList.toggle("active",button.dataset.themeChoice===active);
    });
  }

  function showApiLogin(){ showWelcomeGate(); }

  window.FortniteAgent={searchDatabase,showApiLogin,showOpenRouterLogin,showGoogleLogin,showToast};
})();
