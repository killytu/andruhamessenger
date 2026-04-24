// ws.js — WebSocket client

export class WSClient {
  constructor(handlers={}) {
    this.handlers=handlers; this.ws=null; this.userID=null;
    this.pubKey=null; this.dispName=null;
    this._ready=false; this._closed=false;
    this._timer=null; this._delay=1500;
    this._url=null; this._attempt=0;
  }

  connect(url) {
    if(url)this._url=url;
    if(!this._url||this._closed)return;
    this._attempt++;
    this.handlers.onStatusChange?.({status:'connecting',url:this._url,attempt:this._attempt});
    try{ this.ws=new WebSocket(this._url); }
    catch(e){ this.handlers.onStatusChange?.({status:'error',url:this._url,reason:e.message}); return; }

    this.ws.onopen=()=>{
      if(this._closed){this.ws.close();return;}
      this._ready=true; this._delay=1500; this._attempt=0;
      clearTimeout(this._timer);
      this.handlers.onStatusChange?.({status:'connected',url:this._url});
      this.handlers.onConnect?.();
      if(this.userID&&this.pubKey)
        this._send({type:'register',user_id:this.userID,pub_key:this.pubKey,display_name:this.dispName||this.userID});
    };
    this.ws.onclose=(ev)=>{
      this._ready=false; if(this._closed)return;
      const reason=ev.reason||(ev.code===1006?'Сервер недоступен':ev.code===1015?'TLS error':`code ${ev.code}`);
      this.handlers.onStatusChange?.({status:'offline',url:this._url,reason,attempt:this._attempt});
      this.handlers.onDisconnect?.();
      this._timer=setTimeout(()=>{ this._delay=Math.min(this._delay*1.5,15000); this.connect(); },this._delay);
    };
    this.ws.onerror=()=>{};
    this.ws.onmessage=({data})=>{ try{this._route(JSON.parse(data));}catch{} };
  }

  switchServer(url,userID,pubKey,dispName) {
    this._closed=true; clearTimeout(this._timer);
    try{this.ws?.close();}catch{}
    this._closed=false; this._ready=false; this._delay=1500; this._attempt=0;
    if(userID)this.userID=userID; if(pubKey)this.pubKey=pubKey; if(dispName)this.dispName=dispName;
    this.connect(url);
  }

  destroy(){ this._closed=true; clearTimeout(this._timer); try{this.ws?.close();}catch{}; }

  register(uid,pk,dn){ this.userID=uid; this.pubKey=pk; this.dispName=dn; this._send({type:'register',user_id:uid,pub_key:pk,display_name:dn||uid}); }
  setName(dn)              { this._send({type:'set_name',display_name:dn}); }
  getKey(id)               { this._send({type:'get_key',target:id}); }
  search(query)            { this._send({type:'search',target:query}); }
  sendMessage(to,payload)  { this._send({type:'message',to,payload}); }
  sendSignal(type,to,pl)   { this._send({type,to,payload:pl}); }
  sendReadReceipt(to)      { this._send({type:'read_receipt',to}); }

  get isReady(){ return this._ready&&!this._closed; }
  get currentUrl(){ return this._url; }

  _send(obj){ if(this.ws?.readyState===1){this.ws.send(JSON.stringify(obj));return true;} return false; }

  _route(msg) {
    const h=this.handlers;
    const map={
      registered:'onRegistered', message:'onMessage', pub_key:'onPubKey',
      delivered:'onDelivered', online:'onOnline', offline:'onOffline',
      read:'onRead', name_changed:'onNameChanged', error:'onError',
      search_results:'onSearchResults',
      webrtc_offer:'onWebRTCOffer', webrtc_answer:'onWebRTCAnswer',
      webrtc_ice:'onWebRTCIce', webrtc_cancel:'onWebRTCCancel',
    };
    if(map[msg.type]) h[map[msg.type]]?.(msg);
    else console.warn('[WS] Unknown:',msg.type);
  }
}
