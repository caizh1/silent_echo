import { routeBeats } from './story-routes';
import type { EnemyKind } from './enemies';
export type Point={x:number;z:number};
export type Theme='street'|'mall'|'hospital'|'underground'|'industry'|'station'|'lab'|'port';
export type TaskKind='inspect'|'repair'|'recover'|'open'|'reach'|'defend'|'strike'|'boss'|'upload';
export type TaskSpec={id:string;name:string;kind:TaskKind;text:string;threat:number;effect?:string;seconds:number;position:Point};
export type SectorSpec={id:string;name:string;theme:Theme;arrival:string;record:string;tasks:TaskSpec[];chapter:number;index:number;quiet:boolean;extent:number;exit:Point};
export type ChapterSpec={id:string;name:string;minutes:number;briefing:string;sectors:SectorSpec[]};
type TaskInput=[string,string,TaskKind,string,number?,string?];
function sector(id:string,name:string,theme:Theme,arrival:string,record:string,tasks:TaskInput[],quiet=false):SectorSpec{
 const beats=routeBeats[id],extent=quiet?112:148;
 const routes:TaskInput[]=beats?[
 ['approach',`进入${name}`,'reach','',0],
 ['route-a',beats[0][0],beats[0][1],beats[0][2],quiet?0:Math.max(2,Math.floor((tasks[0][4]??3)/2))],
 tasks[0],
 ['crossing',theme==='hospital'?'穿过受损的医疗连接区':theme==='station'?'穿过封闭的站台连廊':'穿过设备维护通道','reach','',0],
 ['route-b',beats[1][0],beats[1][1],beats[1][2],quiet?0:Math.max(2,Math.floor((tasks[1][4]??3)/2))],
 tasks[1]
 ]:tasks;
 return {id,name,theme,arrival,record,chapter:0,index:0,quiet,extent,exit:{x:0,z:-extent+4},tasks:routes.map(([taskId,title,kind,text,threat=0,effect],i)=>({id:`${id}:${taskId}`,name:title,kind,text,threat,effect,seconds:kind==='repair'?4:kind==='upload'?5:kind==='defend'?24:kind==='reach'?0:2,position:{x:i%3===0?0:i%2===0?-18:18,z:extent-18-i*(extent*2-36)/(routes.length-1)}}))};
}
const S=sector;
export const chapters:ChapterSpec[]=[
{id:'silent-entry',name:'静默入口',minutes:8,briefing:'从地下爆炸现场脱困。找到能够使用的通信设备，确认其他队员的位置。',sectors:[
 S('maintenance','地下维修层','underground','梅森：海斯？皮尔斯？听到请回答。……这里是里德，我还活着。','隔离控制记录：路线更新未同步到本地爆破控制器。系统仍将这条通道识别为无人污染支路。',[
 ['fuse','取出应急保险片','recover','梅森：爆炸把主电路切断了。备用箱里还有一片。'],['door','接通维修门电源','repair','梅森：门能打开。先离开这里，再设法联络。'] ],true),
 S('empty-street','空无一人的街道','street','梅森：街上的车还亮着灯。没有人回应。','商店收据停在同一分钟。窗边的杯子已经干透，墙上的钟仍在走。',[
 ['radio','检查弃置巡逻车','inspect','梅森：车载电台烧了，接收模块还完整。'],['receiver','回收接收模块','recover','梅森：有动静……不是队友。',3]])]},
{id:'reconnect',name:'断线重连',minutes:10,briefing:'通过商场后场恢复消防通信塔的电源。',sectors:[
 S('mall-loading','商场后场','mall','梅森：通信塔在商场后面。消防线路应该有独立供电。','消防巡检表：备用发电机的燃料在事故发生前已被统一调拨。签收单位一栏被涂去。',[
 ['switch','隔离烧毁的支路','repair','梅森：先切断短路，再接备用电源。',4],['power','启动后场发电机','repair','广播：欢迎光临……欢迎光临……',6]]),
 S('fire-tower','消防通信塔','industry','梅森：我看到了塔。天线还在，至少有人能听见。','通信机保留着一段早于官方事故时间的求救呼叫，呼号属于隼鹰分队。',[
 ['antenna','校正应急天线','repair','海斯：里德？保持这个频率。我们在中央车站东侧。',5],['link','建立加密链路','upload','海斯：货运入口会合。别进主干道，那里已经失控。',5,'radio-linked']])]},
{id:'missing-bridge',name:'消失的桥',minutes:10,briefing:'沿河岸前往车站。核对地图与断桥现场，寻找替代路线。',sectors:[
 S('river-street','河岸街区','street','海斯：桥梁应该可通行。地图是我们出发前更新的。','河岸告示：人行桥拆除施工。公告日期在事故发生之前，地图上却仍显示完好。',[
 ['survey','检查桥头交通牌','inspect','梅森：这不是刚炸断的。这里有拆除施工标记。',3],['detour','打通河岸检修路','open','海斯：收到。改走圣朱德医院的地下运输通道。',5]]),
 S('bridge-maintenance','断桥检修区','port','梅森：整段桥体都不在了。数据里却没有这件事。','施工签收单：桥体拆除是为了铺设应急回收管线，工程承包商与实验室运营方相同。',[
 ['ledger','取回施工记录','recover','梅森：承包商是赫利克斯。实验室也是他们的。',4],['hospital-route','开启医院连接道','repair','海斯：先把人带回来。那些记录留着。',6]])]},
{id:'pipe-knock',name:'管道敲击',minutes:12,briefing:'穿过医院，寻找敲击声的来源。',sectors:[
 S('hospital-lobby','医院门诊','hospital','梅森：圣朱德医院。前台电话一直在响。','转运表上写着“全部完成”。轮椅还堵在电梯口，没有任何车辆离开的记录。',[
 ['directory','检查地下运输地图','inspect','梅森：运输通道在病房楼下面。',3],['ward-power','接通病房走廊电源','repair','梅森：有人在敲管道。三下，停一下，再三下。',5]]),
 S('hospital-ward','封闭病房','hospital','伊芙琳：门外的人，报呼号。不要碰门上的红色把手。','床头记录：循环指标改善，认知测试中断。医生的手写批注只有一句——他们不再认得自己的名字。',[
 ['release','解除病房机械闭锁','open','伊芙琳：肖，隼鹰分队军医。终于有人来了。',6,'join-evelyn'],['medicine','回收军医的冷藏箱','recover','伊芙琳：这箱药不能丢。还有，别打你身上的第二支针。',4]]),
 S('hospital-pharmacy','药房与检验室','hospital','伊芙琳：我的队伍也在地下遇到爆炸。我们被要求原地等待，接应从来没来。','药物标签将“稳定”定义为循环维持，未包括神经功能。这份说明没有出现在军用简报里。',[
 ['formulation','比对注射器与药房记录','inspect','伊芙琳：他们给你们的不是中和剂。它只能让受损组织暂时稳定。',6],['sample','取走原始样本','recover','梅森：那它到底救了什么？\n伊芙琳：我们得先知道他们怎么定义“救活”。',5]])]},
{id:'underground-line',name:'地下运输线',minutes:10,briefing:'与伊芙琳共同穿过医院货运线，抵达车站。',sectors:[
 S('medical-freight','医疗货运通道','underground','伊芙琳：走我后面。这里的排气会间歇启动。','货箱标签：隼鹰分队护送设备。签收时间比公开事故时间早了四十八小时。',[
 ['valve','关闭泄漏排气支路','repair','伊芙琳：听到金属颤动就退到旁边。别站在出口前。',7],['dual-power','为货运门恢复双路供电','repair','伊芙琳：我接住这边，你去另一侧。',6]]),
 S('underground-platform','废弃地下站台','station','梅森：前面就是中央车站。海斯，我们到了地下站台。','站台显示屏仍在轮播最后一班车。监控中没有乘客，只有向实验室方向运送的冷藏货箱。',[
 ['track','排除轨道上的封堵','open','海斯：能听见。我们也在靠近货运入口。',8],['station-access','守住站台，接通站内门','defend','伊芙琳：这里的东西在跟着广播移动。把喇叭切掉。',8]])]},
{id:'across-tracks',name:'隔轨相望',minutes:12,briefing:'穿过中央车站，与队友建立目视联系。',sectors:[
 S('station-hall','中央车站大厅','station','海斯：我们在东侧。看见信号灯就回应。','大厅的应急路线被反复修改。每次修改都将携带医疗设备的人员引向回收设施。',[
 ['signal','接通站台信号灯','repair','海斯：看见你了！向北边检修桥走。',8],['platform','清除检修桥入口','open','梅森：我看见他们了。就在对面。',10]]),
 S('inspection-bridge','检修桥','station','皮尔斯：桥在变形！里德，别上来！','应急隔离执行日志：铁路支撑结构被登记为可牺牲设施。指令来源是城市医疗应急平台。',[
 ['collapse','离开失稳桥段','reach','海斯：我们上检修车。去北岸信号站，那里还有独立天线。',8],['military-link','接入军用火力链路','upload','总部：身份确认。开放空中支援权限，由地面确认目标。',8,'unlock-airstrike']]),
 S('rail-yard','露天编组场','station','海斯：轨道出口被堵住了。里德，我们需要一条路。','空袭标定规则：最后确认必须来自地面观察员。城市平台坐标仅作参考。',[
 ['boss','阻止编组场增生体靠近轨道','boss','伊芙琳：它的胸口在收缩。避开正面冲击。',1],['cover','标定轨道外侧并呼叫空袭','strike','海斯：通道打开了！北岸信号站，我们在那里等你。这次不换地方。',7]])]},
{id:'other-side',name:'门的另一边',minutes:8,briefing:'打开工业区闸门，与军医分开行动。',sectors:[
 S('gate-control','闸门控制室','industry','伊芙琳：控制杆不能锁住。必须有人留在这里。','维修图纸保留另一条通往医院的地面线路。军医选择返回，不是走进一条不存在的退路。',[
 ['manual','修复闸门手动机构','repair','梅森：你开门后从地面绕过来。我把箱子带给海斯。',5],['parting','接过军医的备用耳机','recover','伊芙琳：它只能接收。你听到我，不代表我能听见你。',0,'leave-evelyn']]),
 S('maintenance-crossing','闸后维护通道','underground','梅森：肖？……对，只有接收。','墙上的指示灯逐个熄灭。另一侧的操作杆声停止后，通道里只剩下梅森自己的脚步。',[
 ['release','解除出口的机械保险','open','梅森：先把东西送到。我会回来找你。',4],['route','找到工业区地面出口','reach','耳机：……三下敲击声。随后归于寂静。',3]],true)]},
{id:'industrial-echo',name:'工业回声',minutes:12,briefing:'穿越排水和管线设施，查明先遣队的入城时间。',sectors:[
 S('drainage','停摆的排水设施','industry','梅森：北岸路在水下面。先恢复排水。','维护日志：隼鹰分队在四天前申请过通行。登记记录没有被删除，因为这是离线控制器。',[
 ['pump','接通备用排水泵','repair','梅森：四天前？公开事故是两天前。',7],['record','取出离线通行记录','recover','伊芙琳：我们进城时……他们说事故还没有发生。',6,'evidence-time']]),
 S('factory','空置厂房','industry','梅森：肖，刚才那句话是什么意思？……她又听不见。','车间用药登记：员工被要求接受预防性注射，签字页与药物风险页分开归档。',[
 ['conveyor','停下失控输送线','repair','梅森：这些药已经被运到城市的很多地方。',9],['catwalk','打开北侧维护门','open','海斯：我们守着信号站。你慢慢来，别硬闯。',7]]),
 S('pipe-corridor','回收管线走廊','industry','广播：回收系统运行正常。所有指标均处于稳定范围。','管线压力曲线：所谓稳定状态需要持续投药。一旦停止投药，监测数值立即被标成异常。',[
 ['bypass','切断破损回收支路','repair','梅森：广播说正常，这里的管子却一直在漏。',8],['north-route','开启北岸连接道','open','海斯：沿着旧天线走。我们看见你那边的灯了。',10]])]},
{id:'north-light',name:'北岸灯光',minutes:10,briefing:'抵达旧信号站，保住原始药物并打通最后的引桥。',sectors:[
 S('signal-perimeter','信号站外围','industry','总部：建议清除前方处理设施，建立进入通道。','设施清单显示，最后一批未经处理的原始药物仍在冷柜内。目标地图没有标出这项内容。',[
 ['cold-box','转移设施中的原始药物','recover','伊芙琳：听得见吗？先拿出冷柜……不要直接炸。',9],['isolate','隔离储药间管路','repair','梅森：药拿到了。现在确认打击区域。',8]]),
 S('north-bridge','信号站引桥','port','海斯：看见你了。最后一段路，我们掩护你。','这里使用独立军用电台，未接入赫利克斯平台。海斯选择在这里等待，直到里德出现。',[
 ['air-cover','空袭清除引桥外侧追击群','strike','皮尔斯：就是现在，过桥！',10],['reunion','进入信号站与队友会合','reach','海斯：人齐了一半。你身后那个军医呢？\n梅森：我们得把她带回来。',0,'join-squad']])]},
{id:'reverse-signal',name:'逆向追踪',minutes:10,briefing:'与海斯、皮尔斯一起定位军医的最后一次信号。',sectors:[
 S('signal-room','独立通信机房','industry','海斯：把你的耳机接上去。皮尔斯，守住门。','城市任务平台将隼鹰分队的求救消息自动改为医学观察记录。消息存在，搜救频道却从未收到。',[
 ['triangulate','修复信号测向阵列','repair','海斯：两组反射，来源是医院地下。她还在那里。',8],['orders','截取先遣队撤离申请','upload','皮尔斯：申请被驳回了三次。每次都是同一个医学风险编号。',8]]),
 S('old-city-link','旧城区连接道','street','海斯：保持队形。我们一起进去，也一起出来。','沿路三座应急终端显示相同撤离结论，但签名时间完全一致，说明它们只是复制了同一条评估。',[
 ['route','开启旧城区防火门','open','皮尔斯：锁是新的，楼已经空了很久。',10],['access','清除地下档案区入口','defend','海斯：不要追出去。守住这个入口，等门开。',10]])]},
{id:'unreturned',name:'未归者',minutes:12,briefing:'穿过医院未探索区域，找到伊芙琳并带她离开。',sectors:[
 S('medical-archive','地下档案区','hospital','梅森：肖！是里德！我们来接你了！','原始认知测试：伤者生命指标改善后，记忆和身份识别能力持续恶化。报告正文将这组样本全部排除。',[
 ['raw-data','取出被排除的神经记录','recover','海斯：这些人的编号，在官方报告里全都找不到。',9,'evidence-neural'],['archive-door','打开隔离档案室','repair','伊芙琳：别碰自动清洗。它会把纸和样本一起处理掉。',7]]),
 S('hospital-service','医院维护层','underground','伊芙琳：我在下一层。冷藏箱的电池快没了。','医疗负责人批注：请勿更改稳定判据。重新纳入认知损伤样本将使既有安全结论全部失效。',[
 ['cooling','恢复样本冷藏供电','repair','皮尔斯：供电稳住了。现在去找她。',8],['escape-door','打开通往装卸区的门','open','伊芙琳：听见你们了。我也听见它们了。',10]]),
 S('archive-yard','医院装卸庭院','hospital','梅森：肖，站得起来吗？\n伊芙琳：有你们在，我可以。','军医的手记：我曾相信这项治疗。我的签名也在设备交接单上。我必须把完整记录带出去。',[
 ['rescue','为伊芙琳处理伤口','recover','伊芙琳：这次我跟你们走。记录已经拿齐了。',8,'join-evelyn'],['withdraw','掩护小队离开医院','defend','海斯：四个人。一个都不留下。',12]])]},
{id:'recovery-network',name:'回收网络',minutes:12,briefing:'查明回收系统的运行方式，进入实验室网络。',sectors:[
 S('treatment-plant','污染处理站','industry','伊芙琳：他们把这叫净化。实际过程需要一直补充稳定剂。','工艺对照表：应急系统保持组织活动，未降低神经毒性。短期死亡减少被当作了治疗成功。',[
 ['chemistry','采集稳定剂循环样本','recover','伊芙琳：这是救治的一部分，也把真正的问题藏了起来。',10],['feed','关闭向城区回流的支路','repair','海斯：先断这边，保住样本冷却。',10]]),
 S('pipe-hub','管网枢纽','industry','皮尔斯：这条主管直通实验室。还有压力，不能直接炸。','控制器中有两套参数：医疗风险参数和公共报告参数。后者始终不显示认知损伤。',[
 ['pressure','为主管释放残余压力','repair','皮尔斯：压力降下来了，可以切换。',12],['switch-route','改接实验室维护管路','open','梅森：给自己开一条路，也给他们留下原始数据。',10]]),
 S('plant-control','回收控制室','lab','总部：我们正在核对你们提交的材料。暂不改变城市封锁级别。','系统设计者知道认知损伤存在。争议不在于有没有风险，而在于谁被计入风险。',[
 ['compare','导出双版本参数','upload','伊芙琳：把两份一起发。只看他们给的那份，永远都没问题。',10],['lab-access','关闭维护区化学清洗','repair','海斯：实验室入口打开。小队前进。',12]])]},
{id:'outer-lab',name:'实验室外环',minutes:14,briefing:'突破实验室外环，阻止应急销毁流程启动。',sectors:[
 S('lab-tunnel','实验室服务隧道','underground','皮尔斯：这里没有人员活动，只有自动门一直在开关。','指令队列：“危险化学源”包括样本库、病历库和先遣队设备存储间。',[
 ['isolate','隔离隧道清洗回路','repair','海斯：任何标为危险源的东西，先目视确认。',12],['junction','打开外环连接门','open','梅森：任务地图上三个目标，刚好是三份证据的位置。',12]]),
 S('lab-perimeter','外环设施','lab','伊芙琳：外面那些增生物一直在吸收管里的稳定剂。','观察记录：长期高剂量暴露形成稳定增生核心。核心存活不等于患者仍保有恢复机会。',[
 ['coolant','关闭外环增生体供给','repair','皮尔斯：先切供给，再开火。',10],['core','击败外环增生核心','boss','海斯：别挤在一起。它要撞过来了！',1]]),
 S('lab-freight','实验室货运入口','lab','总部：清理名单由医疗应急部门提供。我们需要可独立核验的原始签名。','原始命令由医疗风险负责人签发，军事任务平台只转发风险坐标。总部并未看到病人记录。',[
 ['signature','取得销毁命令的原始签名','recover','海斯：名单不是推断。签名和设备证书都在这里。',12],['inner-door','解除内环封锁','repair','梅森：我们进去看他们到底留下了什么。',14]])]},
{id:'stable-condition',name:'稳定状态',minutes:14,briefing:'取得能够互相印证的原始记录，查明事故与救治经过。',sectors:[
 S('sample-vault','原始样本库','lab','伊芙琳：这些是最初的样本。稳定剂介入前的状态。','对照曲线显示，早期停止暴露仍有恢复窗口。后续治疗维持了生命，却错过了这个窗口。',[
 ['original','保护未经处理的原始样本','recover','伊芙琳：不能承诺每个人都能救回来。但他们从来没得到完整评估。',10],['backup','关闭样本库自动销毁','repair','皮尔斯：销毁定时器停了。样本箱交给我。',12]]),
 S('observation','长期观察室','lab','梅森：这里的摄像头，拍过那支先遣队。','影像记录：隼鹰分队护送稳定设备入城。发现异常后要求撤离，却被告知等待进一步评估。',[
 ['risk-order','取回被压下的撤离评估','recover','海斯：污染风险是真的。他们把风险写成了不救人的理由。',10,'evidence-extraction'],['timeline','交叉核对事故与救治时间线','inspect','伊芙琳：我们执行过那份命令。发现问题时，窗口已经过去了。',10]]),
 S('main-archive','主档案室','lab','总部：时间、样本与签名已收到。正在脱离城市平台进行独立核验。','风险负责人最后的内部批注：如果现在承认判据错误，过去所有已完成的治疗都必须重审。请按原流程结束事件。',[
 ['evidence','封存完整证据包','upload','海斯：保留所有版本，包括我们的签名。不能只带走对自己有利的部分。',12],['orders','接收总部修订命令','upload','总部：原清理命令暂停。授权你队中止持续投药，保全证据并撤离。',8,'orders-revoked']])]},
{id:'last-calibration',name:'最后校准',minutes:12,briefing:'停止持续扩散，维持冷却与通信，并为全队开启撤离路线。',sectors:[
 S('main-control','中央主控层','lab','皮尔斯：三个回路耦合在一起。直接断电，样本和通信也会一起丢。','应急图纸：分步切离可以停止城区投药，同时保留样本冷却。系统从未在正式手册中说明这一操作。',[
 ['disconnect','切离城区投药回路','repair','海斯：梅森操作。我们守着这里。',14],['verify','核对残余投药流量归零','defend','伊芙琳：流量在下降。不要提前离开。',16]]),
 S('emergency-power','应急动力区','industry','总部：城区排放已停止。撤离航线重新核准，前往港口北端。','最后一份设备记录保留了全部操作人。小队没有删除任何一条历史。',[
 ['reserve','为冷藏箱和天线切换备用电源','repair','皮尔斯：电池接上了。可以走了。',12],['harbor','开启港口维护出口','open','海斯：所有人跟紧。最后一段路。',14]])]},
{id:'dawn-extraction',name:'黎明撤离',minutes:14,briefing:'护送原始样本与证据穿过港口，全队登机。',sectors:[
 S('harbor-road','港口通道','port','梅森：天亮了。\n海斯：看路。还没结束。','港口警示灯终于切回人工控制。此时的坐标来自现场观察，不再来自医疗平台。',[
 ['road','移开堵住撤离通道的货运设施','repair','皮尔斯：我处理机械锁，你们守住两侧。',14],['signal','接通撤离引导灯','upload','总部：已确认你们的信号，接近中。',12]]),
 S('cargo-yard','港口装卸区','port','伊芙琳：它们追着冷藏箱的泄漏气味来了。别停。','冷藏箱内保留着疾病原始状态与治疗失败的记录。它不是万能解药，而是重新研究的起点。',[
 ['pursuer','击退最后的追击增生体','boss','海斯：梅森，把它带离通道。其他人保护样本。',1],['final-strike','呼叫空袭封住追击路线','strike','总部：打击坐标确认。所有人离开预警区。',12]]),
 S('extraction-deck','北端撤离平台','port','皮尔斯：平台清楚。伊芙琳先上，样本跟着她。','任务最终记录：四名行动人员及原始证据撤离。事件尚待独立调查，受影响者的救治需要重新评估。',[
 ['beacon','守住撤离引导信标','defend','海斯：我们都到了。守住最后一班。',18],['board','与全队进入登机标记','reach','总部：人员确认，四人。\n梅森：肖，这次你能听见我吗？\n伊芙琳：能。我们回去。',0,'ending']])]},
];
let index=0;chapters.forEach((c,chapter)=>c.sectors.forEach(s=>{s.chapter=chapter;s.index=index++;const width=[14,16,18][s.index%3],mirror=s.index%2?-1:1;s.tasks.forEach((t,i)=>{t.position.x=i%3===0?0:(i%2===0?-1:1)*width*mirror;});}));
export const sectors=chapters.flatMap(c=>c.sectors);
export const members={hayes:{name:'格兰特·海斯',role:'队长',color:'#afc4a1'},pierce:{name:'诺亚·皮尔斯',role:'爆破手',color:'#d6b481'},evelyn:{name:'伊芙琳·肖',role:'军医',color:'#a7ced7'}} as const;
export type MemberId=keyof typeof members;
export const mutationSpecs={
 wanderer:{name:'徘徊者',kind:'runner',hp:70,speed:1.9,damage:8,color:'#8c8178'},
 runner:{name:'奔袭者',kind:'runner',hp:90,speed:3.2,damage:9,color:'#8a7767'},
 pouncer:{name:'扑击者',kind:'pouncer',hp:160,speed:2.2,damage:15,color:'#a68e73'},
 spitter:{name:'喷吐者',kind:'spitter',hp:140,speed:1.3,damage:8,color:'#839376'},
 armored:{name:'重甲增生体',kind:'runner',hp:330,speed:1.15,damage:16,color:'#6e7770'},
 caller:{name:'呼号者',kind:'spitter',hp:180,speed:1.1,damage:6,color:'#b19389'},
 railBoss:{name:'轨道吞噬者',kind:'boss',hp:1250,speed:1.5,damage:23,color:'#827566'},
 labBoss:{name:'外环增生核心',kind:'boss',hp:2000,speed:1.45,damage:25,color:'#91a18d'},
 portBoss:{name:'深港追猎体',kind:'boss',hp:2500,speed:1.7,damage:27,color:'#87999a'},
} satisfies Record<string,{name:string;kind:EnemyKind;hp:number;speed:number;damage:number;color:string}>;
export type Mutation=keyof typeof mutationSpecs;
