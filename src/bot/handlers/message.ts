import { Message, TextChannel, Attachment, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getProject } from "../../db/database.js";
import { isAllowedUser, checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../claude/session-manager.js";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { L } from "../../utils/i18n.js";

async function transcribeVoice(filePath: string): Promise<string | null> {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      console.warn("[voice] GROQ_API_KEY not set in .env");
      return null;
    }

    const formData = new FormData();
    formData.append("model", "whisper-large-v3");
    formData.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
    formData.append("response_format", "text");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (!res.ok) {
      console.warn("[voice] Groq API error:", res.status, await res.text());
      return null;
    }

    return (await res.text()).trim();
  } catch (e) {
    console.warn("[voice] Transcription failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

// Dangerous executable extensions that should not be downloaded
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".dll", ".sys", ".drv",
  ".vbs", ".vbe", ".wsf", ".wsh",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (Discord free tier limit)

async function downloadAttachment(
  attachment: Attachment,
  projectPath: string,
): Promise<{ filePath: string; isImage: boolean } | { skipped: string } | null> {
  const ext = path.extname(attachment.name ?? "").toLowerCase();

  // Block dangerous executables
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { skipped: L(`Blocked: \`${attachment.name}\` (dangerous file type)`, `차단됨: \`${attachment.name}\` (위험한 파일 형식)`) };
  }

  // Skip files that are too large
  if (attachment.size > MAX_FILE_SIZE) {
    const sizeMB = (attachment.size / 1024 / 1024).toFixed(1);
    return { skipped: L(`Skipped: \`${attachment.name}\` (${sizeMB}MB exceeds 25MB limit)`, `건너뜀: \`${attachment.name}\` (${sizeMB}MB, 25MB 제한 초과)`) };
  }

  const uploadDir = path.join("/tmp", "claude-uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `${Date.now()}-${attachment.name}`;
  const filePath = path.join(uploadDir, fileName);

  try {
    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) {
      return { skipped: L(`Failed to download: \`${attachment.name}\``, `다운로드 실패: \`${attachment.name}\``) };
    }

    const fileStream = fs.createWriteStream(filePath);
    await pipeline(Readable.fromWeb(response.body as any), fileStream);
  } catch (e) {
    console.warn(`[download] Failed to download attachment ${attachment.name}:`, e instanceof Error ? e.message : e);
    return { skipped: L(`Failed to download: \`${attachment.name}\``, `다운로드 실패: \`${attachment.name}\``) };
  }

  return { filePath, isImage: IMAGE_EXTENSIONS.has(ext) };
}

export async function handleMessage(message: Message): Promise<void> {
  console.log(`[msg] author=${message.author.id} attachments=${message.attachments.size} flags=${message.flags.toArray().join(',')} content="${message.content.slice(0,50)}"`);
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check if channel is registered
  const project = getProject(message.channelId);
  if (!project) return;

  // Auth check
  if (!isAllowedUser(message.author.id)) {
    await message.reply(L("You are not authorized to use this bot.", "이 봇을 사용할 권한이 없습니다."));
    return;
  }

  // Rate limit
  if (!checkRateLimit(message.author.id)) {
    await message.reply(L("Rate limit exceeded. Please wait a moment.", "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."));
    return;
  }

  // Check for pending custom text input (AskUserQuestion "직접 입력")
  if (sessionManager.hasPendingCustomInput(message.channelId)) {
    const text = message.content.trim();
    if (text) {
      sessionManager.resolveCustomInput(message.channelId, text);
      await message.react("✅");
    }
    return;
  }

  let prompt = message.content.trim();

  // Download attachments (images, documents, code files, etc.)
  const imagePaths: string[] = [];
  const filePaths: string[] = [];
  const skippedMessages: string[] = [];

  for (const [, attachment] of message.attachments) {
    // Handle voice messages (Discord sends them as .ogg with waveform data)
    const ext = path.extname(attachment.name ?? "").toLowerCase();
    console.log(`[attachment] name=${attachment.name} ext=${ext} waveform=${!!(attachment as any).waveform} contentType=${attachment.contentType}`);
    if (ext === ".ogg" || (attachment as any).waveform) {
      await message.react("🎙️");
      const tmpPath = path.join("/tmp", `discord-voice-${Date.now()}.ogg`);
      try {
        const res = await fetch(attachment.url);
        if (res.ok && res.body) {
          await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmpPath));
          const transcript = await transcribeVoice(tmpPath);
          fs.unlinkSync(tmpPath);
          if (transcript) {
            prompt = transcript;
            await message.react("✅");
          } else {
            await message.reply(L("Voice transcription failed.", "음성 변환에 실패했습니다."));
            return;
          }
        }
      } catch (e) {
        console.warn("[voice] Download failed:", e instanceof Error ? e.message : e);
      }
      continue;
    }

    const result = await downloadAttachment(attachment, project.project_path);
    if (!result) continue;
    if ("skipped" in result) {
      skippedMessages.push(result.skipped);
      continue;
    }
    if (result.isImage) {
      imagePaths.push(result.filePath);
    } else {
      filePaths.push(result.filePath);
    }
  }

  if (skippedMessages.length > 0) {
    await message.reply(skippedMessages.join("\n"));
  }

  if (imagePaths.length > 0) {
    prompt += `\n\n[Attached images - use Read tool to view these files]\n${imagePaths.join("\n")}`;
  }
  if (filePaths.length > 0) {
    prompt += `\n\n[Attached files - use Read tool to read these files]\n${filePaths.join("\n")}`;
  }

  if (!prompt) return;

  const channel = message.channel as TextChannel;

  // If session is active, offer to queue the message
  if (sessionManager.isActive(message.channelId)) {
    if (sessionManager.hasQueue(message.channelId)) {
      await message.reply(L("⏳ A message is already waiting to be queued. Please press the button first.", "⏳ 이미 큐 추가 대기 중인 메시지가 있습니다. 버튼을 먼저 눌러주세요."));
      return;
    }
    if (sessionManager.isQueueFull(message.channelId)) {
      await message.reply(L("⏳ Queue is full (max 5). Please wait for the current task to finish.", "⏳ 큐가 가득 찼습니다 (최대 5개). 현재 작업 완료를 기다려주세요."));
      return;
    }

    sessionManager.setPendingQueue(message.channelId, channel, prompt);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue-yes:${message.channelId}`)
        .setLabel(L("Add to Queue", "큐에 추가"))
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`queue-no:${message.channelId}`)
        .setLabel(L("Cancel", "취소"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
    );

    await message.reply({
      content: L("⏳ A previous task is in progress. Process this automatically when done?", "⏳ 이전 작업이 진행 중입니다. 완료 후 자동으로 처리할까요?"),
      components: [row],
    });
    return;
  }

  // Send message to Claude session
  await sessionManager.sendMessage(channel, prompt);
}
