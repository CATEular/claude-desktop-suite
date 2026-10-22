/* Bounded actor construction: at most limit items in each main-loop turn. */
var Batch=class Batch {
 constructor(schedule,cancel,limit){this._schedule=schedule;this._cancel=cancel;this._limit=limit||6;this._id=0;this._epoch=0;}
 run(items,visit,done){if(this._dead)return;this.stop();let epoch=this._epoch,index=0;
  const step=()=>{this._id=0;if(epoch!==this._epoch)return;let end=Math.min(items.length,index+this._limit);
   for(;index<end;index++)visit(items[index],index);
   if(index<items.length)this._id=this._schedule(step);else if(done)done();};
  this._id=this._schedule(step);
 }
 stop(){this._epoch++;if(this._id)this._cancel(this._id);this._id=0;}
 destroy(){this._dead=true;this.stop();}
};
