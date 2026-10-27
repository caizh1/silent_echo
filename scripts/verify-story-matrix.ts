import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,createWriteStream,rmSync} from 'node:fs';
mkdirSync('.runtime/story',{recursive:true});
const results:unknown[]=[];
await Promise.all(['rifle','pistol','smg'].map(async weapon=>{
 for(const seed of [42,17,1337]){
  const reportPath=`.runtime/story/route-${weapon}-${seed}.json`;rmSync(reportPath,{force:true});
  const log=createWriteStream(`.runtime/story/matrix-${weapon}-${seed}.log`);
  const code=await new Promise<number>(resolve=>{const child=spawn(process.execPath,['--import','tsx','scripts/verify-story.ts',weapon,String(seed)],{stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);child.on('exit',status=>resolve(status??1));});
  log.end();let result;try{result=JSON.parse(readFileSync(reportPath,'utf8'));}catch{result={武器:weapon,随机种子:seed,结果:'执行异常'};}results.push(result);console.log(JSON.stringify({武器:weapon,随机种子:seed,结果:result.结果,用时秒:result.用时秒}));if(code!==0)process.exitCode=1;
 }
}));
writeFileSync('.runtime/story/matrix-report.json',JSON.stringify({说明:'三种武器与三个固定随机种子的完整战役验证；不替代真人时长与三小时实机持续运行验收。',样本:results},null,2));
