require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const Parser = require('rss-parser');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '6490210446');
const MONETAG_DIRECT_LINK = process.env.MONETAG_DIRECT_LINK || 'https://omg10.com/4/11768388';
const COOLDOWN_SECONDS = Math.max(0, Number(process.env.COOLDOWN_SECONDS || 20));
const PORT = Number(process.env.PORT || 10000);
if (!BOT_TOKEN) { console.error('BOT_TOKEN is missing'); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());
const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'BanglaSmartTools/2.0' } });
const users = new Map();
const tasks = new Map();
const tempDir = path.join(os.tmpdir(), 'bangla-smart-tools');
fs.mkdirSync(tempDir, { recursive: true });

function userKey(ctx) { return String(ctx.from?.id || ''); }
function touchUser(ctx) {
  const id = userKey(ctx); if (!id) return;
  const old = users.get(id) || { id, firstName: ctx.from.first_name || '', username: ctx.from.username || '', joinedAt: Date.now(), uses: 0, referrals: 0 };
  old.firstName = ctx.from.first_name || old.firstName; old.username = ctx.from.username || old.username; old.lastSeen = Date.now();
  users.set(id, old);
}
function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛠 All Tools','all_tools')],
    [Markup.button.callback('📷 Photo Tools','photo_menu'), Markup.button.callback('📄 PDF Tools','pdf_menu')],
    [Markup.button.callback('📋 CV Maker','cv_start'), Markup.button.callback('💼 Jobs','jobs')],
    [Markup.button.callback('📰 Bangladesh News','news'), Markup.button.callback('🧠 Daily GK & Quiz','gk')],
    [Markup.button.callback('🌤 Weather','weather'), Markup.button.callback('💱 Currency','currency')],
    [Markup.button.callback('🛒 Market Price','market'), Markup.button.callback('🌐 Translator','translate')],
    [Markup.button.callback('🎁 Daily Reward','reward'), Markup.button.callback('👥 Refer & Earn','refer')],
    [Markup.button.callback('👤 My Account','account'), Markup.button.callback('ℹ️ Help','help')]
  ]);
}
function backButton() { return Markup.inlineKeyboard([[Markup.button.callback('⬅️ Main Menu','home')]]); }
function monetagButton(taskId, label='🔗 Continue') {
  return Markup.inlineKeyboard([[Markup.button.url(label, MONETAG_DIRECT_LINK)], [Markup.button.callback('↩️ Cancel','home')]]);
}
function createTask(ctx, action, extra={}) {
  const id = crypto.randomBytes(8).toString('hex');
  tasks.set(id, { userId:userKey(ctx), action, createdAt:Date.now(), ...extra });
  return id;
}
function afterAdKeyboard(taskId) {
  return Markup.inlineKeyboard([[Markup.button.callback('✅ I continued — proceed', `proceed:${taskId}`)], [Markup.button.callback('❌ Cancel','home')]]);
}
function validTask(ctx, id) {
  const t = tasks.get(id); return t && t.userId === userKey(ctx) && Date.now()-t.createdAt >= COOLDOWN_SECONDS*1000;
}
async function gate(ctx, action, extra={}) {
  const id = createTask(ctx, action, extra);
  await ctx.reply(`🔗 **একটি ছোট ধাপ আগে**\n\n${COOLDOWN_SECONDS} সেকেন্ড অপেক্ষার পর নিচের বাটনে চাপলে কাজটি চালু হবে।`, { parse_mode:'Markdown', ...monetagButton(id) });
}
async function processProceed(ctx, id) {
  const t = tasks.get(id);
  if (!t || t.userId !== userKey(ctx)) return ctx.answerCbQuery('এই কাজটি আপনার জন্য নয়।', {show_alert:true});
  const remaining = Math.ceil((COOLDOWN_SECONDS*1000 - (Date.now()-t.createdAt))/1000);
  if (remaining > 0) return ctx.answerCbQuery(`আর ${remaining} সেকেন্ড অপেক্ষা করুন।`, {show_alert:true});
  tasks.delete(id); users.get(userKey(ctx)).uses++;
  await ctx.answerCbQuery('চলছে...');
  if (t.action === 'photo_info') return photoMenu(ctx);
  if (t.action === 'pdf_info') return pdfMenu(ctx);
  if (t.action === 'news') return sendNews(ctx);
  if (t.action === 'jobs') return sendJobs(ctx);
  if (t.action === 'gk') return sendGK(ctx);
  if (t.action === 'weather') return sendWeather(ctx);
  if (t.action === 'currency') return sendCurrency(ctx);
  if (t.action === 'market') return sendMarket(ctx);
  if (t.action === 'translate') return startTranslate(ctx);
  if (t.action === 'reward') return sendReward(ctx);
  return ctx.reply('কাজ প্রস্তুত করা হয়েছে।', mainMenu());
}

function photoMenu(ctx) { return ctx.reply('📷 **Photo Tools**\n\n• Photo resize/compress\n• Passport-style crop\n• Image format conversion\n\nএকটি ছবি পাঠান।', {parse_mode:'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📤 ছবি পাঠিয়ে শুরু করুন','photo_help')],[Markup.button.callback('⬅️ Main Menu','home')]])}); }
function pdfMenu(ctx) { return ctx.reply('📄 **PDF Tools**\n\nএক বা একাধিক ছবি পাঠিয়ে PDF বানাতে পারবেন।', {parse_mode:'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🖼️ Images → PDF','img_pdf')],[Markup.button.callback('⬅️ Main Menu','home')]])}); }

bot.start(async ctx => { touchUser(ctx); ctx.session = {}; await ctx.reply(`👋 স্বাগতম ${ctx.from.first_name || ''}!\n\n🤖 **Bangla Smart Tools**\nএক জায়গায় প্রয়োজনীয় অনেক দরকারি টুলস।`, {parse_mode:'Markdown', ...mainMenu()}); });
bot.command('menu', async ctx => { touchUser(ctx); ctx.session={}; return ctx.reply('📋 Main Menu', mainMenu()); });
bot.command('tools', ctx => ctx.reply('🛠 All Tools', mainMenu()));
bot.command('stats', async ctx => { if(userKey(ctx)!==ADMIN_ID) return ctx.reply('⛔ Admin only.'); return ctx.reply(`📊 Users: ${users.size}\nTasks waiting: ${tasks.size}`); });

bot.action('home', async ctx => { touchUser(ctx); ctx.session={}; await ctx.answerCbQuery(); return ctx.reply('📋 Main Menu', mainMenu()); });
bot.action('all_tools', async ctx => { await ctx.answerCbQuery(); return ctx.reply('🛠 All Tools', mainMenu()); });
bot.action('photo_menu', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'photo_info'); });
bot.action('pdf_menu', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'pdf_info'); });
bot.action('proceed:(.+)', async ctx => processProceed(ctx, ctx.match[1]));

bot.action('photo_help', async ctx => { await ctx.answerCbQuery(); return ctx.reply('ছবি পাঠান। আমি সেটি compressed JPG হিসেবে ফেরত দেব।\n\n📌 Face/identity পরিবর্তন করা হবে না।'); });
bot.action('img_pdf', async ctx => { await ctx.answerCbQuery(); ctx.session={mode:'pdf', images:[]}; return ctx.reply('এক বা একাধিক ছবি পাঠান। সব ছবি শেষ হলে **/makepdf** লিখুন।', {parse_mode:'Markdown'}); });

bot.on('photo', async ctx => {
  touchUser(ctx);
  if (ctx.session?.mode === 'pdf') {
    try {
      const p = await downloadTelegramFile(ctx, ctx.message.photo.at(-1).file_id, '.jpg');
      ctx.session.images = ctx.session.images || []; ctx.session.images.push(p);
      return ctx.reply(`✅ ছবি ${ctx.session.images.length} যোগ হয়েছে। আরও ছবি পাঠান অথবা /makepdf লিখুন।`);
    } catch(e) { return ctx.reply('ছবি নেওয়া যায়নি। আবার চেষ্টা করুন।'); }
  }
  if (ctx.session?.mode === 'translate') return ctx.reply('এখানে ছবি নয়, text পাঠান।');
  try {
    const p = await downloadTelegramFile(ctx, ctx.message.photo.at(-1).file_id, '.jpg');
    const out = path.join(tempDir, `${crypto.randomUUID()}.jpg`);
    await sharp(p).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toFile(out);
    await ctx.replyWithPhoto({source:out}, {caption:'✅ Photo compressed/resized successfully.'});
    cleanup([p,out]);
  } catch(e) { console.error(e); ctx.reply('❌ Photo processing failed.'); }
});

bot.command('makepdf', async ctx => {
  if (!ctx.session?.images?.length) return ctx.reply('আগে অন্তত ১টি ছবি পাঠান।');
  const images=[...ctx.session.images]; ctx.session={};
  const out=path.join(tempDir,`${crypto.randomUUID()}.pdf`);
  try { await imagesToPdf(images,out); await ctx.replyWithDocument({source:out},{caption:'✅ আপনার PDF তৈরি হয়েছে।'}); cleanup([...images,out]); }
  catch(e){ console.error(e); ctx.reply('❌ PDF তৈরি করা যায়নি।'); }
});

async function downloadTelegramFile(ctx, fileId, ext='') {
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(link.href);
  if (!res.ok) throw new Error('download failed');
  const p=path.join(tempDir,`${crypto.randomUUID()}${ext}`); fs.writeFileSync(p,Buffer.from(await res.arrayBuffer())); return p;
}
function imagesToPdf(images,out) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({autoFirstPage:false,margin:0}); const ws=fs.createWriteStream(out); doc.pipe(ws);
    (async()=>{ try { for(const img of images){ const meta=await sharp(img).metadata(); const w=meta.width||800,h=meta.height||1000; doc.addPage({size:[w,h],margin:0}); doc.image(img,0,0,{width:w,height:h}); } doc.end(); ws.on('finish',resolve); ws.on('error',reject); } catch(e){reject(e);} })();
  });
}
function cleanup(files){ for(const f of files){ try{fs.unlinkSync(f);}catch{} } }

bot.action('cv_start', async ctx => { await ctx.answerCbQuery(); ctx.session={mode:'cv',step:'name',data:{}}; return ctx.reply('📋 CV Maker\n\nআপনার **পূর্ণ নাম** লিখুন:', {parse_mode:'Markdown'}); });
bot.action('jobs', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'jobs'); });
bot.action('news', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'news'); });
bot.action('gk', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'gk'); });
bot.action('weather', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'weather'); });
bot.action('currency', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'currency'); });
bot.action('market', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'market'); });
bot.action('translate', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'translate'); });
bot.action('reward', async ctx => { await ctx.answerCbQuery(); return gate(ctx,'reward'); });
bot.action('refer', async ctx => { await ctx.answerCbQuery(); const me=await ctx.telegram.getMe(); const link=`https://t.me/${me.username}?start=ref_${userKey(ctx)}`; return ctx.reply(`👥 **Refer & Earn**\n\nআপনার referral link:\n${link}\n\nবন্ধুকে পাঠান।`, {parse_mode:'Markdown', ...backButton()}); });
bot.action('account', async ctx => { await ctx.answerCbQuery(); const u=users.get(userKey(ctx))||{}; return ctx.reply(`👤 **My Account**\n\nID: ${u.id||userKey(ctx)}\nনাম: ${u.firstName||ctx.from.first_name||'-'}\nব্যবহার: ${u.uses||0}\nReferral: ${u.referrals||0}`, {parse_mode:'Markdown', ...backButton()}); });
bot.action('help', async ctx => { await ctx.answerCbQuery(); return ctx.reply('ℹ️ Help\n\n/start — Main Menu\nছবি পাঠালে Photo Tool কাজ করবে।\nPDF-এর জন্য Images → PDF ব্যবহার করুন।\nCV Maker-এ ধাপে ধাপে তথ্য দিন।', backButton()); });

bot.on('text', async ctx => {
  touchUser(ctx); const s=ctx.session; const text=ctx.message.text.trim();
  if (!s?.mode) return;
  if (s.mode==='cv') return handleCV(ctx,text);
  if (s.mode==='translate') return doTranslate(ctx,text);
});

async function handleCV(ctx,text){
  const s=ctx.session; s.data=s.data||{};
  if(s.step==='name'){s.data.name=text;s.step='phone';return ctx.reply('📱 মোবাইল নম্বর লিখুন:');}
  if(s.step==='phone'){s.data.phone=text;s.step='email';return ctx.reply('📧 Email লিখুন:');}
  if(s.step==='email'){s.data.email=text;s.step='education';return ctx.reply('🎓 শিক্ষাগত যোগ্যতা লিখুন:');}
  if(s.step==='education'){s.data.education=text;s.step='experience';return ctx.reply('💼 কাজের অভিজ্ঞতা লিখুন (না থাকলে লিখুন: নেই):');}
  if(s.step==='experience'){s.data.experience=text;s.step='skills';return ctx.reply('🛠 Skills লিখুন:');}
  if(s.step==='skills'){s.data.skills=text; const d=s.data; s.mode=null; const msg=`📋 **CV Draft Ready**\n\n**${d.name}**\n📱 ${d.phone}\n📧 ${d.email}\n\n🎓 Education\n${d.education}\n\n💼 Experience\n${d.experience}\n\n🛠 Skills\n${d.skills}\n\nএটি আপনার CV-এর draft।`; return ctx.reply(msg,{parse_mode:'Markdown',...mainMenu()});}
}

async function sendNews(ctx){
  const feeds=[['Prothom Alo','https://www.prothomalo.com/feed'],['Samakal','https://samakal.com/rss.xml'],['Bangladesh Pratidin','https://www.bd-pratidin.com/rss.xml']];
  let out='📰 **বাংলাদেশের টপ নিউজ**\n\n'; let count=0;
  for(const [name,url] of feeds){ try{const f=await parser.parseURL(url); for(const x of (f.items||[]).slice(0,2)){out+=`• ${name}: ${x.title}\n`;count++;}}catch{} }
  if(!count) out+='এই মুহূর্তে নিউজ feed পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।'; return ctx.reply(out,{parse_mode:'Markdown',...backButton()});
}
async function sendJobs(ctx){
  const urls=['https://www.bdjobs.com/','https://www.thedailystar.net/career'];
  return ctx.reply(`💼 **চাকরির খবর**\n\nলাইভ চাকরির জন্য:\n• Bdjobs: ${urls[0]}\n• The Daily Star Career: ${urls[1]}\n\nBot-এ পরে নির্দিষ্ট চাকরি category/filter যোগ করা যাবে।`,{parse_mode:'Markdown',...backButton()});
}
async function sendGK(ctx){
  const qs=[['বাংলাদেশের জাতীয় ফুল কী?','শাপলা'],['বাংলাদেশের স্বাধীনতা দিবস কবে?','২৬ মার্চ'],['বাংলাদেশের জাতীয় সংসদের আসন সংখ্যা কত?','৩০০']];
  const q=qs[Math.floor(Math.random()*qs.length)]; return ctx.reply(`🧠 **Daily GK**\n\nপ্রশ্ন: ${q[0]}\n\nউত্তর দেখতে নিচের বাটনে চাপুন।`,{parse_mode:'Markdown',...Markup.inlineKeyboard([[Markup.button.callback('✅ উত্তর দেখুন',`ans:${Buffer.from(q[1]).toString('base64')}`)],[Markup.button.callback('⬅️ Main Menu','home')]])});
}
bot.action('ans:(.+)',async ctx=>{await ctx.answerCbQuery(); const a=Buffer.from(ctx.match[1],'base64').toString(); return ctx.reply(`✅ উত্তর: **${a}**`,{parse_mode:'Markdown',...backButton()});});
async function sendWeather(ctx){
  try{const cities={Dhaka:[23.8103,90.4125],Chattogram:[22.3569,91.7832],Rangpur:[25.7439,89.2752],Khulna:[22.8456,89.5403],Rajshahi:[24.3745,88.6042]}; let out='🌤 **বাংলাদেশ Weather**\n\n'; for(const [c,[lat,lon]] of Object.entries(cities)){const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FDhaka`);const j=await r.json();out+=`• ${c}: ${j.current?.temperature_2m ?? '-'}°C, humidity ${j.current?.relative_humidity_2m ?? '-'}%\n`;} return ctx.reply(out,{parse_mode:'Markdown',...backButton()});}catch{return ctx.reply('🌤 Weather API এখন পাওয়া যাচ্ছে না।',{...backButton()});}}
async function sendCurrency(ctx){try{const r=await fetch('https://api.frankfurter.app/latest?from=USD&to=BDT,EUR,GBP,INR');const j=await r.json();return ctx.reply(`💱 **Currency (reference rates)**\n\n1 USD ≈ ${j.rates?.BDT??'-'} BDT\n1 USD ≈ ${j.rates?.EUR??'-'} EUR\n1 USD ≈ ${j.rates?.GBP??'-'} GBP\n1 USD ≈ ${j.rates?.INR??'-'} INR\n\nব্যাংক/মানি এক্সচেঞ্জের rate আলাদা হতে পারে।`,{parse_mode:'Markdown',...backButton()});}catch{return ctx.reply('💱 Currency service unavailable.',backButton());}}
async function sendMarket(ctx){return ctx.reply('🛒 **Daily Market Price**\n\nএই v2 build-এ বাজারদর section প্রস্তুত আছে, কিন্তু নির্ভরযোগ্য সরকারি live price feed ছাড়া অনুমানভিত্তিক দাম দেখানো হচ্ছে না। নির্ভরযোগ্য source/API যুক্ত হলে জেলা/বাজারভিত্তিক live price চালু করা যাবে।',{parse_mode:'Markdown',...backButton()});}
async function startTranslate(ctx){ctx.session={mode:'translate'};return ctx.reply('🌐 Translator\n\nইংরেজি/বাংলা একটি বাক্য পাঠান। উদাহরণ: `I am going home`');}
async function doTranslate(ctx,text){try{const r=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|bn`);const j=await r.json();const tr=j.responseData?.translatedText;ctx.session={};return ctx.reply(`🌐 **Translation**\n\n${tr||'অনুবাদ পাওয়া যায়নি।'}`,{parse_mode:'Markdown',...backButton()});}catch{return ctx.reply('অনুবাদ service এখন unavailable।');}}
async function sendReward(ctx){const u=users.get(userKey(ctx))||{};u.rewardDay=new Date().toISOString().slice(0,10);users.set(userKey(ctx),u);return ctx.reply('🎁 **Daily Reward**\n\nআজকের reward claim করা হয়েছে।\n\nনোট: এই bot এখনো টাকা/ক্রিপ্টো payout করে না; এটি foundation reward system।',{parse_mode:'Markdown',...backButton()});}

bot.catch((err,ctx)=>{console.error('BOT ERROR',err); try{ctx.reply('⚠️ সাময়িক সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।');}catch{}});
const app=express(); app.get('/',(req,res)=>res.status(200).send('Bangla Smart Tools Bot is running')); app.get('/health',(req,res)=>res.json({ok:true,users:users.size})); app.listen(PORT,()=>console.log(`HTTP server on ${PORT}`));
bot.launch().then(()=>console.log('Telegram bot launched')).catch(e=>{console.error('Launch failed',e);process.exit(1)});
process.once('SIGINT',()=>bot.stop('SIGINT')); process.once('SIGTERM',()=>bot.stop('SIGTERM'));
