require("dotenv").config();
const express = require("express");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 6490210446);
const MONETAG_DIRECT_LINK = process.env.MONETAG_DIRECT_LINK || "https://omg10.com/4/11768388";
const PORT = Number(process.env.PORT || 10000);
const COOLDOWN_SECONDS = Number(process.env.COOLDOWN_SECONDS || 20);

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is missing. Add it in Render Environment Variables.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

const users = new Map();
const tasks = new Map();

function getUser(ctx) {
  const id = ctx.from.id;
  if (!users.has(id)) users.set(id, {
    id, name: ctx.from.first_name || "User",
    username: ctx.from.username || "",
    joinedAt: new Date().toISOString(), tasks: 0
  });
  return users.get(id);
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🛠 All Tools", "tools")],
    [Markup.button.callback("📸 Photo Tools", "photo"), Markup.button.callback("📄 PDF Tools", "pdf")],
    [Markup.button.callback("📋 CV Maker", "cv"), Markup.button.callback("💼 Jobs", "jobs")],
    [Markup.button.callback("📰 Bangladesh News", "news"), Markup.button.callback("🧠 Daily GK & Quiz", "gk")],
    [Markup.button.callback("🌦 Weather", "weather"), Markup.button.callback("💱 Currency", "currency")],
    [Markup.button.callback("🛒 Market Price", "market"), Markup.button.callback("🌐 Translator", "translate")],
    [Markup.button.callback("🎁 Daily Reward", "reward"), Markup.button.callback("👥 Refer & Earn", "refer")],
    [Markup.button.callback("👤 My Account", "account"), Markup.button.callback("ℹ️ Help", "help")]
  ]);
}

const tools = [
  ["📸 Photo Tools","photo"],["📄 PDF & Files","pdf"],["📋 CV Maker","cv"],
  ["🧮 Age Calculator","age"],["🎵 MP3 / Audio","audio"],["💼 চাকরির খবর","jobs"],
  ["📰 বাংলাদেশ নিউজ","news"],["🧠 Daily GK & Quiz","gk"],["🛒 Daily Market Price","market"],
  ["🌐 Translator","translate"],["💱 Currency Converter","currency"],["🌦 Weather","weather"]
];

function toolsMenu() {
  return Markup.inlineKeyboard(
    tools.map(x => Markup.button.callback(x[0], x[1])).concat([[Markup.button.callback("⬅️ Main Menu","home")]])
  );
}

function taskButtons(taskId) {
  return Markup.inlineKeyboard([
    [Markup.button.url("🔗 Continue", MONETAG_DIRECT_LINK)],
    [Markup.button.callback("🔄 Start New Task", `newtask:${taskId}`)]
  ]);
}

function createTask(userId, title) {
  const id = `${userId}-${Date.now()}`;
  tasks.set(id, {userId, title, createdAt: Date.now()});
  return id;
}

async function feature(ctx, title, text) {
  getUser(ctx);
  const id = createTask(ctx.from.id, title);
  return ctx.reply(`${title}\n\n${text}\n\n✅ কাজের ফলাফল/পরবর্তী ধাপ প্রস্তুত হলে Continue ব্যবহার করুন।`, taskButtons(id));
}

bot.start(async ctx => {
  const u = getUser(ctx);
  await ctx.reply(`👋 স্বাগতম ${u.name}!\n\n🤖 *Bangla Smart Tools*\nএক জায়গায় প্রয়োজনীয় অনেক দরকারি টুলস।`, {parse_mode:"Markdown", ...mainMenu()});
});
bot.command("menu", ctx => ctx.reply("📋 Main Menu", mainMenu()));
bot.command("tools", ctx => ctx.reply("🛠 All Tools", toolsMenu()));

bot.action("home", async ctx => { await ctx.answerCbQuery(); return ctx.reply("📋 Main Menu", mainMenu()); });
bot.action("tools", async ctx => { await ctx.answerCbQuery(); return ctx.reply("🛠 All Tools", toolsMenu()); });

const descriptions = {
  photo:"ছবি Resize, Passport Photo, Signature ও Background Tools পরবর্তী ধাপে যুক্ত হবে।",
  pdf:"PDF merge, split, image-to-PDF ও file tools পরবর্তী ধাপে যুক্ত হবে।",
  cv:"বাংলা/ইংরেজি CV Builder ও professional templates পরবর্তী ধাপে যুক্ত হবে।",
  age:"জন্মতারিখ দিয়ে বয়স হিসাবের সুবিধা পরবর্তী ধাপে যুক্ত হবে।",
  audio:"Audio/MP3 tools পরবর্তী ধাপে যুক্ত হবে।",
  jobs:"বাংলাদেশের চাকরির নির্ভরযোগ্য feed/API পরবর্তী ধাপে যুক্ত হবে।",
  news:"বাংলাদেশের গুরুত্বপূর্ণ খবরের feed/API পরবর্তী ধাপে যুক্ত হবে।",
  gk:"দৈনিক GK, quiz, score ও result card পরবর্তী ধাপে যুক্ত হবে।",
  market:"ঢাকা, চট্টগ্রাম, কুমিল্লা, রংপুর, খুলনা, রাজশাহীসহ বাজারদরের data source পরবর্তী ধাপে যুক্ত হবে।",
  translate:"বাংলা ↔ Englishসহ translation service পরবর্তী ধাপে যুক্ত হবে।",
  currency:"লাইভ exchange-rate source দিয়ে currency conversion পরবর্তী ধাপে যুক্ত হবে।",
  weather:"বাংলাদেশের শহরভিত্তিক weather service পরবর্তী ধাপে যুক্ত হবে।",
  reward:"Daily reward system পরবর্তী ধাপে যুক্ত হবে। বিজ্ঞাপনে ক্লিক করা বাধ্যতামূলক নয়।"
};
for (const [key, text] of Object.entries(descriptions)) {
  bot.action(key, async ctx => { await ctx.answerCbQuery(); return feature(ctx, key === "photo" ? "📸 Photo Tools" : "🛠 "+key, text); });
}

bot.action("refer", async ctx => {
  await ctx.answerCbQuery();
  const me = await bot.telegram.getMe();
  return ctx.reply(`👥 Refer & Earn\n\nআপনার referral link:\nhttps://t.me/${me.username}?start=ref_${ctx.from.id}`);
});
bot.action("account", async ctx => {
  await ctx.answerCbQuery();
  const u = getUser(ctx);
  return ctx.reply(`👤 My Account\n\nID: ${u.id}\nName: ${u.name}\nTasks: ${u.tasks}`);
});
bot.action("help", async ctx => {
  await ctx.answerCbQuery();
  return ctx.reply("ℹ️ Help & Support\n\n/start — Bot চালু\n/menu — Main Menu\n/tools — All Tools\n\nসমস্যা হলে Admin-এর সাথে যোগাযোগ করুন।");
});

bot.action(/^newtask:(.+)$/, async ctx => {
  await ctx.answerCbQuery();
  const task = tasks.get(ctx.match[1]);
  if (!task || task.userId !== ctx.from.id) return ctx.reply("⚠️ এই task আর সক্রিয় নেই।");
  const left = COOLDOWN_SECONDS * 1000 - (Date.now() - task.createdAt);
  if (left > 0) return ctx.reply(`⏳ নতুন task শুরু করতে আরও ${Math.ceil(left/1000)} সেকেন্ড অপেক্ষা করুন।`);
  getUser(ctx).tasks++;
  return ctx.reply("🔄 নতুন Task প্রস্তুত!\n\nআপনার প্রয়োজনীয় tool নির্বাচন করুন।", toolsMenu());
});

bot.command("stats", ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ Admin only.");
  return ctx.reply(`📊 Users: ${users.size}\nTasks: ${tasks.size}`);
});

bot.catch((err) => console.error("Bot error:", err));

app.get("/", (_req,res) => res.status(200).send("Bangla Smart Tools Bot is running."));
app.get("/health", (_req,res) => res.json({ok:true}));
app.listen(PORT, () => console.log(`Web server listening on ${PORT}`));

bot.launch().then(() => console.log("Telegram bot started.")).catch(err => {
  console.error(err); process.exit(1);
});
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
