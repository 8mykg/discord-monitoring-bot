const http = require('http');
const PORT = process.env.PORT || 3000;

// RenderのWeb Service用ダミーサーバー
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 環境変数から設定を読み込み
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_URL = process.env.TARGET_URL || 'https://example.com';

let previousStatus = 'UP';

client.once('ready', () => {
  console.log(`Botがログインしました: ${client.user.tag}`);

  // 5分ごとに自動監視を実行 (cron)
  cron.schedule('*/5 * * * *', async () => {
    console.log('定期監視チェック実行中...');
    await checkAndNotify();
  });
});

// `!status` コマンドに応答
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    const startTime = Date.now();
    try {
      const res = await axios.get(TARGET_URL, { timeout: 10000, headers: { 'Cache-Control': 'no-cache' } });
      const responseTime = Date.now() - startTime;

      let statusTitle = '📊 リアルタイム稼働状況';
      let statusValue = '✅ 正常稼働中 (200 OK)';
      let color = 0x2ECC71; // 緑

      if (responseTime >= 1500) {
        statusTitle = '⚠️ リアルタイム稼働状況 (遅延発生)';
        statusValue = '⚠️ 動作不安定 (レイテンシ高)';
        color = 0xF1C40F; // 黄色
      }

      const embed = new EmbedBuilder()
        .setTitle(statusTitle)
        .addFields(
          { name: 'ステータス', value: statusValue, inline: true },
          { name: '応答時間', value: `${responseTime} ms`, inline: true },
          { name: '監視URL', value: TARGET_URL }
        )
        .setColor(color)
        .setTimestamp();

      message.reply({ embeds: [embed] });
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 リアルタイム稼働状況')
        .addFields(
          { name: 'ステータス', value: '🔴 ダウン検知 (接続不可)', inline: true },
          { name: '監視URL', value: TARGET_URL }
        )
        .setColor(0xE74C3C) // 赤
        .setTimestamp();

      message.reply({ embeds: [embed] });
    }
  }
});

// 定期監視と状態チェックスケジュール
async function checkAndNotify() {
  if (!CHANNEL_ID) return;

  let channel;
  try {
    channel = await client.channels.fetch(CHANNEL_ID);
  } catch (e) {
    console.error('チャンネルの取得に失敗しました:', e.message);
    return;
  }

  const startTime = Date.now();
  let currentStatus = 'DOWN';
  let responseTime = 0;

  try {
    const res = await axios.get(TARGET_URL, {
      timeout: 10000,
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    responseTime = Date.now() - startTime;

    if (res.status === 200) {
      if (responseTime >= 1500) {
        currentStatus = 'DEGRADED'; // 動作不安定
      } else {
        currentStatus = 'UP';       // 正常
      }
    }
  } catch (err) {
    currentStatus = 'DOWN';
    console.log(`[定期監視] エラー検知: ${err.message}`);
  }

  // 状態が変化した時のみ Discord に通知を送信
  if (currentStatus !== previousStatus) {
    const embed = new EmbedBuilder().setTimestamp();

    if (currentStatus === 'DOWN') {
      embed.setTitle('🚨 【障害発生】Webサイトがダウンしました')
        .setDescription(`監視対象: ${TARGET_URL}`)
        .setColor(0xE74C3C);
    } else if (currentStatus === 'DEGRADED') {
      embed.setTitle('⚠️ 【動作不安定】高レイテンシを検知しました')
        .setDescription(`監視対象: ${TARGET_URL}\n応答時間: ${responseTime} ms`)
        .setColor(0xF1C40F);
    } else if (currentStatus === 'UP') {
      embed.setTitle('✅ 【復旧】Webサイトが正常に戻りました')
        .setDescription(`監視対象: ${TARGET_URL}\n応答時間: ${responseTime} ms`)
        .setColor(0x2ECC71);
    }

    channel.send({ embeds: [embed] });
  }

  previousStatus = currentStatus;
}

client.login(TOKEN);