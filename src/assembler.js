// LIMO assembler: pure ES module, no dependencies; runs in browsers and Node.
// Encodings follow M1 ISA spec v1.0 (frozen). Fields: R/I/S/B/J as in A3.
export const OPS = {
  eketsa:{f:'R',op:0x33,f3:0,f7:0}, tlosa:{f:'R',op:0x33,f3:0,f7:0x20},
  le:{f:'R',op:0x33,f3:7,f7:0},     kapa:{f:'R',op:0x33,f3:6,f7:0},
  eketsana:{f:'I',op:0x13,f3:0},    suthela:{f:'I',op:0x13,f3:1,shift:1},
  nka:{f:'I',op:0x03,f3:2,mem:1},   kenya:{f:'S',op:0x23,f3:2,mem:1},
  lekana:{f:'B',op:0x63,f3:0},      nyane:{f:'B',op:0x63,f3:4},
  tsamaea:{f:'J',op:0x6f},          boela:{f:'I',op:0x67,f3:0,jalr:1},
  ema:{f:'N',op:0x0b},
};
export const MAX_WORDS = 1024; // 4 KiB instruction memory
const REGS = {letho:0,zero:0,khutlo:1,ra:1,qubu:2,sp:2,motheo:15,gp:15};
for (let i=0;i<16;i++) REGS['r'+i]=i;
['nk','t'].forEach(p=>{for(let i=0;i<4;i++)REGS[p+i]=3+i;});
['bl','s'].forEach(p=>{for(let i=0;i<4;i++)REGS[p+i]=7+i;});
['nt','a'].forEach(p=>{for(let i=0;i<4;i++)REGS[p+i]=11+i;});
export const REG_NAMES = ['letho','khutlo','qubu','nk0','nk1','nk2','nk3','bl0','bl1','bl2','bl3','nt0','nt1','nt2','nt3','motheo'];
const FIELDS = { // [name, hi, lo]
  R:[['funct7',31,25],['rsv',24,22],['rs2',21,18],['rs1',17,14],['funct3',13,11],['rd',10,7],['opcode',6,0]],
  I:[['imm',31,18],['rs1',17,14],['funct3',13,11],['rd',10,7],['opcode',6,0]],
  S:[['imm[13:4]',31,22],['rs2',21,18],['rs1',17,14],['funct3',13,11],['imm[3:0]',10,7],['opcode',6,0]],
  B:[['off[13:4]',31,22],['rs2',21,18],['rs1',17,14],['funct3',13,11],['off[3:0]',10,7],['opcode',6,0]],
  J:[['off',31,11],['rd',10,7],['opcode',6,0]],
  N:[['zero',31,7],['opcode',6,0]],
};
const norm = s => s.toLowerCase().replace(/[’‘'`]/g,''); // apostrophe rule (A4)
const hex = w => '0x'+(w>>>0).toString(16).toUpperCase().padStart(8,'0');
const bin = w => (w>>>0).toString(2).padStart(32,'0');
function dist(a,b){const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;
  for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]!==b[j-1]));p=t;}}return d[b.length];}
function parseImm(t){ if(!/^[+-]?(0x[0-9a-f]+|\d+)$/i.test(t)) return null;
  const neg=t[0]==='-', s=t.replace(/^[+-]/,''); const v=s.toLowerCase().startsWith('0x')?parseInt(s,16):parseInt(s,10); return neg?-v:v; }
const sext=(v,b)=>v&((1<<b)-1);

export function assemble(src){
  const errors=[], labels={}, items=[]; let addr=0;
  const err=(line,msg)=>errors.push({line,msg:`Line ${line}: ${msg}`});
  src.split(/\r?\n/).forEach((raw,i)=>{
    const line=i+1; let t=norm(raw.split(';')[0]).trim(); if(!t) return;
    const m=t.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/);
    if(m){ if(labels[m[1]]!==undefined) err(line,`label "${m[1]}" is already defined (apostrophes are ignored, so ts'a and tsa are the same name).`);
           else labels[m[1]]=addr; t=m[2].trim(); }
    if(!t) return;
    const sp=t.search(/\s/), mn=sp<0?t:t.slice(0,sp), rest=sp<0?'':t.slice(sp).trim();
    let args=rest?rest.split(',').map(s=>s.trim()):[];
    items.push({line,addr,mn,args,text:raw.split(';')[0].trim()}); addr+=4;
  });
  if(items.length>MAX_WORDS) err(items[MAX_WORDS].line,`the program has ${items.length} instructions but instruction memory holds only ${MAX_WORDS}.`);
  const listing=[];
  for(const it of items){
    const {line,mn}=it; let args=it.args;
    if(mn==='khutla'){ if(args.length) err(line,'"khutla" takes no operands.'); it.mn='boela'; args=['letho','khutlo','0']; }
    const d=OPS[it.mn];
    if(!d){ const best=Object.keys(OPS).concat('khutla').sort((a,b)=>dist(mn,a)-dist(mn,b))[0];
      err(line,`I do not know the instruction "${mn}".`+(dist(mn,best)<=2?` Did you mean "${best}"?`:'')); continue; }
    const reg=a=>{ if(a in REGS) return REGS[a]; err(line,`"${a}" is not a register. Use r0-r15, or a name such as nk0, bl1, nt2, letho.`); return 0; };
    const imm=(a,lo,hi,what='number')=>{ const v=parseImm(a); if(v===null){err(line,`"${a}" is not a ${what}. Write it in decimal or as 0x... hex.`);return 0;}
      if(v<lo||v>hi){err(line,`${what} ${v} is out of range for ${it.mn}; allowed range is ${lo} to ${hi}.`);return 0;} return v; };
    const need=(n,eg)=>{ if(args.length!==n){err(line,`"${it.mn}" needs ${n} operand${n===1?'':'s'} (for example: ${eg}) but found ${args.length}.`);return false;} return true; };
    const memop=a=>{ const m=a.match(/^(.*)\(\s*([^)]+)\s*\)$/); if(!m){err(line,`"${a}" must be written offset(register), for example 4(nk0).`);return null;}
      const off=m[1].trim()===''?0:imm(m[1].trim(),-8192,8191,'offset'); if(off%4!==0) err(line,`offset ${off} must be a multiple of 4 (words are 4 bytes).`); return [off,reg(m[2].trim())]; };
    let w=0, rd=0,rs1=0,rs2=0,v=0;
    switch(d.f){
      case 'R': if(need(3,`${it.mn} r3, r1, r2`)){rd=reg(args[0]);rs1=reg(args[1]);rs2=reg(args[2]);}
        w=(d.f7<<25)|(rs2<<18)|(rs1<<14)|(d.f3<<11)|(rd<<7)|d.op; break;
      case 'I':
        if(d.mem){ if(need(2,`nka r3, 4(r1)`)){rd=reg(args[0]);const m=memop(args[1]);if(m){v=m[0];rs1=m[1];}} }
        else if(d.jalr){ if(need(3,`boela r0, r1, 0`)){rd=reg(args[0]);rs1=reg(args[1]);v=imm(args[2],-8192,8191,'offset');} }
        else if(need(3,`${it.mn} r3, r1, ${d.shift?'2':'5'}`)){rd=reg(args[0]);rs1=reg(args[1]);
          v=d.shift?imm(args[2],0,31,'shift amount'):imm(args[2],-8192,8191,'immediate');}
        w=(sext(v,14)<<18)|(rs1<<14)|(d.f3<<11)|(rd<<7)|d.op; break;
      case 'S': if(need(2,`kenya r3, 4(r1)`)){rs2=reg(args[0]);const m=memop(args[1]);if(m){v=m[0];rs1=m[1];}}
        v=sext(v,14); w=(((v>>4)&0x3ff)<<22)|(rs2<<18)|(rs1<<14)|(d.f3<<11)|((v&15)<<7)|d.op; break;
      case 'B': case 'J': {
        const nr=d.f==='B'?3:2; if(need(nr,d.f==='B'?`${it.mn} r1, r2, lupu`:`tsamaea khutlo, lupu`)){
          const lab=args[nr-1]; if(d.f==='B'){rs1=reg(args[0]);rs2=reg(args[1]);} else rd=reg(args[0]);
          if(!(lab in labels)) err(line,`the label "${lab}" is not defined anywhere in the program.`);
          else { v=(labels[lab]-it.addr)/4; const b=d.f==='B'?14:21;
            if(v<-(2**(b-1))||v>=2**(b-1)){err(line,`the label "${lab}" is too far away (${v} words); ${it.mn} reaches ${-(2**(b-1))} to ${2**(b-1)-1} words.`);v=0;} } }
        if(d.f==='B'){ v=sext(v,14); w=(((v>>4)&0x3ff)<<22)|(rs2<<18)|(rs1<<14)|(d.f3<<11)|((v&15)<<7)|d.op; }
        else { w=((v&0x1fffff)<<11)|(rd<<7)|d.op; } break; }
      case 'N': need(0,'ema'); w=d.op; break;
    }
    w>>>=0;
    listing.push({line,addr:it.addr,word:w,hex:hex(w),bin:bin(w),text:it.text,fmt:d.f,
      fields:FIELDS[d.f].map(([n,hi,lo])=>({name:n,hi,lo,bits:bin(w).slice(31-hi,32-lo)}))});
  }
  return {ok:errors.length===0,errors,labels,listing,words:errors.length?[]:listing.map(l=>l.word)};
}
