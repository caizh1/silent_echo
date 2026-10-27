import type { AmmoSound } from './ammo';

// 换弹不提前排队整段声音：由模拟跨过动作节点时触发，暂停不会继续播后续动作。
export function createAmmoAudio(context: AudioContext) {
  const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.12),context.sampleRate);
  const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const active=new Set<()=>void>();
  function click(delay:number,duration:number,frequency:number,volume:number,noise=false) {
    const now=context.currentTime+delay,gain=context.createGain(),filter=context.createBiquadFilter();
    filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=noise ? .7 : 3;
    let source:AudioBufferSourceNode|OscillatorNode;
    if(noise){const sample=context.createBufferSource();sample.buffer=buffer;source=sample;}
    else{const tone=context.createOscillator();tone.type='triangle';tone.frequency.setValueAtTime(frequency,now);tone.frequency.exponentialRampToValueAtTime(frequency*.65,now+duration);source=tone;}
    gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(volume,now+.003);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    source.connect(filter);filter.connect(gain);gain.connect(context.destination);
    const stop=()=>{source.stop();source.disconnect();filter.disconnect();gain.disconnect();active.delete(stop);};
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();active.delete(stop);};
    active.add(stop);source.start(now);source.stop(now+duration);
  }
  return {
    play(event:AmmoSound) {
      if(context.state!=='running')return;
      if(event==='magazine-out'){click(0,.07,1100,.12,true);click(.055,.04,520,.07);}
      if(event==='magazine-in'){click(0,.085,740,.15,true);click(.015,.065,190,.12);}
      if(event==='bolt'){click(0,.1,2100,.14,true);click(.07,.045,900,.12,true);}
      if(event==='empty')click(0,.05,1350,.05);
      if(event==='ammo-pickup'){click(0,.07,880,.055);click(.065,.08,1320,.045);}
      if(event==='crate-open'){click(0,.1,380,.13,true);click(.07,.08,190,.075);}
    },
    stop(){for(const stop of [...active])stop();},
    get activeVoices(){return active.size;},
  };
}
