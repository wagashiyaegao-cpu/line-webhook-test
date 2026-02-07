// 環境変数にチャネルアクセストークンを入れるのがベスト
const LINE_ACCESS_TOKEN = "{XbtVgr4JfayHVe9SBGM5I6h0sa4ujuxXLBka9bh/gYWDrA9ZD9fDT6PYHGTRxqHUKpp32crnyaMCTqTjUGNyyQstmxUZqggKGe1nZbXgTsYePmcT2zFL8r49eJwJOW0SXGmC1cEeQlXSPA3rty1AVgdB04t89/1O/w1cDnyilFU=}";

// ユーザーごとの状態管理
let currentStep = {};
let reservationData = {};

// LINEに返信する関数（axiosをやめてfetchを使用）
async function replyMessage(replyToken, text, quickReplies = null) {
  const message = { type: "text", text };
  if (quickReplies) message.quickReply = { items: quickReplies };

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ replyToken, messages: [message] })
  });
}

// 確認メッセージ
async function sendConfirm(replyToken, d) {
  await replyMessage(
    replyToken,
    `【ご予約内容の確認】
お名前：${d.name}
電話番号：${d.phone}
商品：${d.product}
受け取り日時：${d.datetime}

こちらの内容でよろしいでしょうか？`,
    [
      { type: "action", action: { type: "message", label: "はい", text: "はい" } },
      { type: "action", action: { type: "message", label: "いいえ", text: "いいえ" } }
    ]
  );
}

// Workerの入口
export default {
  async fetch(request) {
    if (request.method !== "POST") return new Response("OK");

    try {
      const body = await request.json();
      const event = body.events[0];
      const replyToken = event.replyToken;
      const userId = event.source.userId;
      const text = event.message.text;

      // ===== キャンセル =====
      if (currentStep[userId] && text === "キャンセル") {
        currentStep[userId] = null;
        reservationData[userId] = null;
        await replyMessage(
          replyToken,
          "予約の入力をキャンセルしました。\nまたご利用の際は「ご予約」と送ってください。"
        );
        return new Response("OK");
      }

      // ===== 開始 =====
      if (!currentStep[userId] && (text === "ご予約" || text === "予約")) {
        currentStep[userId] = "askName";
        reservationData[userId] = {};
        await replyMessage(replyToken, "こんにちは！まずお名前を教えてください。");
        return new Response("OK");
      }

      if (!currentStep[userId]) return new Response("OK");

      // ===== フロー =====
      if (currentStep[userId] === "askName") {
        reservationData[userId].name = text;
        currentStep[userId] = "askPhone";
        await replyMessage(replyToken, "ご連絡先のお電話番号を教えてください📞\n（例：090-1234-5678）");
      } else if (currentStep[userId] === "askPhone") {
        const phoneRegex = /^[0-9\-]{10,13}$/;
        if (!phoneRegex.test(text)) {
          await replyMessage(replyToken, "電話番号の形式をご確認ください。\n（例：090-1234-5678）");
          return new Response("OK");
        }
        reservationData[userId].phone = text;
        currentStep[userId] = "askProduct";
        await replyMessage(replyToken, "商品名と個数を教えてください。\n（例：商品A 2個）");
      } else if (currentStep[userId] === "askProduct") {
        reservationData[userId].product = text;
        currentStep[userId] = "askDateTime";
        await replyMessage(replyToken, "受け取り希望の日時を教えてください📅\n（例：1月25日 15時）");
      } else if (currentStep[userId] === "askDateTime") {
        const hasDate = /日|\/|-/.test(text);
        const hasTime = /時|:\d{2}|\d{1,2}時/.test(text);

        if (!hasDate || !hasTime) {
          await replyMessage(
            replyToken,
            "受け取り希望の日時をもう一度教えてください📅\n（例：1月25日 15時）"
          );
          return new Response("OK");
        }

        reservationData[userId].datetime = text;
        currentStep[userId] = "confirm";
        await sendConfirm(replyToken, reservationData[userId]);
      } else if (currentStep[userId] === "confirm") {
        if (text === "はい") {
          await replyMessage(
            replyToken,
            "ご予約内容を受け付けました。\nただいまお店で商品のご用意状況を確認しております。\n確認ができ次第、担当者より改めてご連絡いたします。"
          );
          currentStep[userId] = null;
        } else {
          currentStep[userId] = "selectEdit";
          await replyMessage(
            replyToken,
            "修正したい項目を選んでください。",
            [
              { type: "action", action: { type: "message", label: "名前", text: "name" } },
              { type: "action", action: { type: "message", label: "電話番号", text: "phone" } },
              { type: "action", action: { type: "message", label: "商品", text: "product" } },
              { type: "action", action: { type: "message", label: "受け取り日時", text: "datetime" } },
              { type: "action", action: { type: "message", label: "キャンセル", text: "キャンセル" } }
            ]
          );
        }
      } else if (currentStep[userId] === "selectEdit") {
        const map = {
          name: "お名前を教えてください。",
          phone: "電話番号を教えてください。",
          product: "商品名と個数を教えてください。",
          datetime: "受け取り希望の日時を教えてください📅\n（例：1月25日 15時）"
        };
        currentStep[userId] = "ask" + text.charAt(0).toUpperCase() + text.slice(1);
        await replyMessage(replyToken, map[text]);
      }

      return new Response("OK");

    } catch (err) {
      console.error(err);
      return new Response("Error", { status: 500 });
    }
  }
};
