import {PERIODS} from '../web/engine.js';
export const now=Math.floor(1800000000000/900000)*900000+7*60000;
export function rows(period,start=95,end=100){const boundary=Math.floor(now/period)*period;return Array.from({length:200},(_,i)=>{const c=start+(end-start)*i/199;return [boundary-(200-i)*period,c-.05,c+.4,c-.4,c,10];});}
export function fixture(){
 const fourHour=rows(PERIODS['4H'],60,100),hour=rows(PERIODS['1H'],70,100),structure=rows(PERIODS['15m'],96,100),entry=rows(PERIODS['5m'],97,100.7),micro=rows(PERIODS['1m'],99,100.82);
 structure[150][2]=106;structure[170][2]=104.8;structure[194][3]=99.4;
 structure[198]=[structure[198][0],99.99,100.2,99.8,100.1,10];
 structure[199]=[structure[199][0],100.1,100.7,100,100.6,30];
 entry[194][3]=99.9;entry[198][2]=100.75;entry[199]=[entry[199][0],100.5,101,100.4,100.8,30];
 micro[198]=[micro[198][0],100.7,100.8,100.6,100.75,10];micro[199]=[micro[199][0],100.75,100.9,100.7,100.82,10];
 return {accountEquity:1000,contractRules:{sizeMultiplier:'.001',minTradeNum:'.001',minTradeUSDT:'5'},symbol:'TESTUSDT',fourHour,hour,structure,entry,micro,quote:{bidPr:100.82,askPr:100.82,ts:now},now};
}
