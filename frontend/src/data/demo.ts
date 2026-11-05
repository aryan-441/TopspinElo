import type { Match, Player, Workspace } from '../types';

export function demoWorkspace(): Workspace {
  const names = ['Asha Mehta','Leo Chen','Maya Rao','Noah Kim','Isha Patel','Omar Ali','Zoe Tan','Arjun Shah'];
  const players: Player[] = names.map((name,index) => ({
    id:'demo-'+index,name,initials:name.split(' ').map(part=>part[0]).join(''),
    hand:index%3===0?'Left':'Right',grip:index%2?'Penhold':'Shakehand',style:['Attacker','Defender','All-rounder','Chopper'][index%4],
    rating:1000+index*35,wins:0,losses:0,pointsWon:0,recent:[]
  }));
  const groups = [0,1].map(index=>({id:'group-'+index,name:'Group '+String.fromCharCode(65+index),entryIds:players.slice(index*4,index*4+4).map(p=>p.id)}));
  const matches: Match[] = [];
  groups.forEach(group=>group.entryIds.forEach((one,i)=>group.entryIds.slice(i+1).forEach(two=>{
    const index=matches.length;
    const match: Match = {id:'demo-match-'+index,playerOneId:one,playerTwoId:two,sideOneId:one,sideTwoId:two,
      sideOnePlayerIds:[one],sideTwoPlayerIds:[two],status:index===11?'Scheduled':'Completed',tournamentId:'demo-cup',tournamentName:'Harbour Club Cup',
      categoryId:'demo-singles',category:'Open singles',round:group.name+' · Round '+(index%3+1),startsAt:'10:00',table:String(index%2+1),
      format:'Best of 3',pointsPerGame:11,gamesToWin:2,score:{[one]:0,[two]:0},gamesWon:{[one]:0,[two]:0},serverId:one,tossWinnerId:one,events:[],
      startRatings:Object.fromEntries(players.map(p=>[p.id,p.rating])),gameResults:[]};
    if(index!==11) {
      for(let game=0;game<3;game++){
        const winner=(game+index)%3===0?two:one;
        const loser=winner===one?two:one;
        const deuce=(index+game)%3===0;
        const target=deuce?12:11;
        const loserPoints=deuce?10:5+(index+game)%5;
        let a=0,b=0;
        const order=[...Array(loserPoints).fill(loser),...Array(target).fill(winner)] as string[];

        for(const who of order) {
          const total=a+b;
          const server=(total<20?Math.floor(total/2):total)%2===0?one:two;
          if(who===one)a++;else b++;
          match.events.unshift({id:match.id+'-'+game+'-'+total,winnerId:who,serverId:server,game:game+1,score:a+'–'+b,
            kind:'Point',time:'10:00',recordedAt:new Date(Date.UTC(2026,9,10+index,10,game,total)).toISOString()});
        }
        match.gameResults!.push({one:a,two:b,winnerId:winner});
        match.gamesWon[winner]++;
        match.score={[one]:a,[two]:b};
        if(match.gamesWon[winner]===2){match.winnerId=winner;break}
      }
      match.completedAt=new Date(Date.UTC(2026,9,10+index,11)).toISOString();
    }
    matches.push(match);
  })));
  for(const p of players){
    const rows=matches.filter(m=>m.status==='Completed'&&[m.playerOneId,m.playerTwoId].includes(p.id));
    p.wins=rows.filter(m=>m.winnerId===p.id).length;p.losses=rows.length-p.wins;
    p.recent=rows.slice(-5).reverse().map(m=>m.winnerId===p.id?'W':'L');
    p.pointsWon=rows.flatMap(m=>m.events).filter(e=>e.winnerId===p.id).length;
  }
  return {clubName:'Harbour Club · demo',players,matches,referees:[{id:'demo-ref',name:'Taylor Reed',active:true}],activityLog:[],
    tournaments:[{id:'demo-cup',name:'Harbour Club Cup',date:'20 Oct 2026',venue:'Club hall',format:'Group stage',status:'Running',tableCount:2,
      entrantIds:players.map(p=>p.id),matchIds:matches.map(m=>m.id),completed:11,rounds:3,progressPaused:false,tieBreaks:['Wins','Game difference','Point difference'],standings:[],audit:[],
      categories:[{id:'demo-singles',name:'Open singles',kind:'Singles',format:'Group stage',entries:players.map(p=>({id:p.id,name:p.name,playerIds:[p.id]})),
        groupStage:{groupCount:2,advancePerGroup:2,advanceToKnockout:true,groups,advanced:false}}]}]};
}
