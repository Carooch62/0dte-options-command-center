// Completion-based scheduling: no overlap and no catch-up burst after a hidden tab.
export class QuotePoller {
 constructor({run,allowed=()=>true,onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,interval=60000}){Object.assign(this,{run,allowed,onChange,setTimer,clearTimer,interval});this.enabled=false;this.running=false;this.failures=0;this.timer=null;this.version=0;}
 notify(){this.onChange({enabled:this.enabled,running:this.running,delay_ms:this.interval*Math.min(16,2**this.failures),failures:this.failures});}
 arm(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;if(this.enabled&&!this.running)this.timer=this.setTimer(()=>this.tick(),this.interval*Math.min(16,2**this.failures));this.notify();}
 enable(value){this.version++;this.enabled=!!value;this.failures=0;this.arm();}
 async tick(){this.timer=null;if(!this.enabled||this.running)return;if(!this.allowed()){this.arm();return;}const version=this.version;this.running=true;this.notify();try{const result=await this.run();if(version!==this.version)return;if(['SIGN_IN','ACCESS_DENIED','AUTHORIZATION','SETUP','EXPIRED'].includes(result?.code)){this.enabled=false;}else this.failures=result?.ok?0:Math.min(4,this.failures+1);}catch{if(version===this.version)this.failures=Math.min(4,this.failures+1);}finally{this.running=false;this.arm();}}
 postpone(){if(this.enabled)this.arm();}
}
export function quoteSessionOpen(snapshot,now=Date.now()){
 const generated=Date.parse(snapshot?.generated_at),open=Date.parse(snapshot?.session_open_at),close=Date.parse(snapshot?.session_close_at);
 return snapshot?.market_session==='OPEN'&&Number.isFinite(generated)&&generated<=now&&now-generated<=600000&&Number.isFinite(open)&&Number.isFinite(close)&&open<=generated&&generated<close&&open<=now&&now<close;
}
