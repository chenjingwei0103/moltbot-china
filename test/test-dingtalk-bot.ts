/**
 * 钉钉机器人 Stream 模式测试脚本
 * 
 * 使用方法:
 * 1. 安装依赖: npm install dingtalk-stream
 * 2. 设置环境变量或直接修改下面的配置
 * 3. 运行: npx ts-node test-dingtalk-bot.ts
 */

import DingtalkStream, {
  DingTalkStreamClient,
  Credential,
  ChatbotMessage,
  ACKStatus,
} from "dingtalk-stream";

// ============ 配置区域 ============
// 方式1: 使用环境变量 (推荐)
// 设置: set DINGTALK_CLIENT_ID=your_client_id
//       set DINGTALK_CLIENT_SECRET=your_client_secret

// 方式2: 直接填写 (仅测试用，不要提交到代码库)
const CLIENT_ID = process.env.DINGTALK_CLIENT_ID ;
const CLIENT_SECRET = process.env.DINGTALK_CLIENT_SECRET ;
// ==================================

async function main() {
  console.log("🤖 钉钉机器人测试启动...");
  console.log(`   Client ID: ${CLIENT_ID.substring(0, 8)}...`);

  if (CLIENT_ID === "your_client_id_here") {
    console.error("❌ 请先配置 Client ID 和 Client Secret");
    console.error("   可以设置环境变量或直接修改脚本中的配置");
    process.exit(1);
  }

  // 创建凭证
  const credential = new Credential(CLIENT_ID, CLIENT_SECRET);

  // 创建 Stream 客户端
  const client = new DingTalkStreamClient({ credential });

  // 注册机器人消息回调
  client.registerCallbackHandler(
    ChatbotMessage.TOPIC,
    async (message: any) => {
      try {
        const data = ChatbotMessage.fromDict(message.data);
        
        console.log("\n📨 收到消息:");
        console.log(`   发送者: ${data.senderNick} (${data.senderId})`);
        console.log(`   会话类型: ${data.conversationType === "1" ? "单聊" : "群聊"}`);
        console.log(`   消息类型: ${data.messageType}`);
        console.log(`   内容: ${data.text?.content || "[非文本消息]"}`);

        // 简单回复：echo 收到的消息
        const replyContent = `✅ 收到你的消息: "${data.text?.content || "非文本"}"`;
        
        // 使用 OpenAPI 回复消息
        await replyMessage(data, replyContent);

        return { status: ACKStatus.SUCCESS };
      } catch (err) {
        console.error("❌ 处理消息出错:", err);
        return { status: ACKStatus.SYSTEM_EXCEPTION };
      }
    }
  );

  // 启动客户端
  console.log("\n🚀 正在连接钉钉服务器...");
  
  try {
    await client.start();
    console.log("✅ 连接成功！机器人已上线");
    console.log("\n💡 现在可以:");
    console.log("   - 在钉钉工作台找到机器人，发起单聊");
    console.log("   - 或在群里 @机器人 发送消息");
    console.log("\n按 Ctrl+C 停止...\n");
  } catch (err) {
    console.error("❌ 连接失败:", err);
    process.exit(1);
  }
}

// 回复消息的辅助函数
async function replyMessage(incoming: any, content: string) {
  // 使用 dingtalk-stream 内置的回复方法
  // 或者调用 OpenAPI
  console.log(`   📤 回复: ${content}`);
  
  // 注意: 实际回复需要调用钉钉 OpenAPI
  // 这里简化处理，完整实现需要使用 @alicloud/dingtalk 包
}

// 运行
main().catch(console.error);
