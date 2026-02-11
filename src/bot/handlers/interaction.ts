import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { isAllowedUser } from "../../security/guard.js";
import { sessionManager } from "../../claude/session-manager.js";
import { upsertSession, getProject } from "../../db/database.js";
import { findSessionDir } from "../commands/sessions.js";

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!isAllowedUser(interaction.user.id)) {
    await interaction.reply({
      content: "You are not authorized.",
      ephemeral: true,
    });
    return;
  }

  const customId = interaction.customId;
  // Use split with limit to handle session IDs that might contain colons
  const colonIndex = customId.indexOf(":");
  const action = colonIndex === -1 ? customId : customId.slice(0, colonIndex);
  const requestId = colonIndex === -1 ? "" : customId.slice(colonIndex + 1);

  if (!requestId) {
    await interaction.reply({
      content: "Invalid button interaction.",
      ephemeral: true,
    });
    return;
  }

  // Handle stop button
  if (action === "stop") {
    const channelId = requestId;
    const stopped = await sessionManager.stopSession(channelId);
    await interaction.update({
      content: "⏹️ 작업이 중지되었습니다.",
      components: [],
    });
    if (!stopped) {
      await interaction.followUp({
        content: "활성 세션이 없습니다.",
        ephemeral: true,
      });
    }
    return;
  }

  // Handle session resume button
  if (action === "session-resume") {
    const sessionId = requestId;
    const channelId = interaction.channelId;
    const { randomUUID } = await import("node:crypto");
    upsertSession(randomUUID(), channelId, sessionId, "idle");

    await interaction.update({
      embeds: [
        {
          title: "Session Resumed",
          description: [
            `Session: \`${sessionId.slice(0, 8)}...\``,
            "",
            "Next message you send will resume this conversation.",
          ].join("\n"),
          color: 0x00ff00,
        },
      ],
      components: [],
    });
    return;
  }

  // Handle session cancel button
  if (action === "session-cancel") {
    await interaction.update({
      content: "Cancelled.",
      embeds: [],
      components: [],
    });
    return;
  }

  // Handle session delete button
  if (action === "session-delete") {
    const sessionId = requestId;
    const channelId = interaction.channelId;
    const project = getProject(channelId);

    if (!project) {
      await interaction.update({
        content: "Project not found.",
        embeds: [],
        components: [],
      });
      return;
    }

    const sessionDir = findSessionDir(project.project_path);
    if (sessionDir) {
      const filePath = path.join(sessionDir, `${sessionId}.jsonl`);
      try {
        fs.unlinkSync(filePath);
        await interaction.update({
          embeds: [
            {
              title: "Session Deleted",
              description: `Session \`${sessionId.slice(0, 8)}...\` has been deleted.`,
              color: 0xff6b6b,
            },
          ],
          components: [],
        });
      } catch {
        await interaction.update({
          content: "Failed to delete session file.",
          embeds: [],
          components: [],
        });
      }
    }
    return;
  }

  let decision: "approve" | "deny" | "approve-all";
  if (action === "approve") {
    decision = "approve";
  } else if (action === "deny") {
    decision = "deny";
  } else if (action === "approve-all") {
    decision = "approve-all";
  } else {
    return;
  }

  const resolved = sessionManager.resolveApproval(requestId, decision);
  if (!resolved) {
    await interaction.reply({
      content: "This approval request has expired.",
      ephemeral: true,
    });
    return;
  }

  const labels: Record<string, string> = {
    approve: "✅ Approved",
    deny: "❌ Denied",
    "approve-all": "⚡ Auto-approve enabled for this channel",
  };

  await interaction.update({
    content: labels[decision],
    components: [], // remove buttons
  });
}

export async function handleSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!isAllowedUser(interaction.user.id)) {
    await interaction.reply({
      content: "You are not authorized.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === "session-select") {
    const selectedSessionId = interaction.values[0];

    // Show Resume / Delete buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`session-resume:${selectedSessionId}`)
        .setLabel("Resume")
        .setStyle(ButtonStyle.Success)
        .setEmoji("▶️"),
      new ButtonBuilder()
        .setCustomId(`session-delete:${selectedSessionId}`)
        .setLabel("Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId(`session-cancel:_`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.update({
      embeds: [
        {
          title: "Session Selected",
          description: `Session: \`${selectedSessionId.slice(0, 8)}...\`\n\nResume or delete this session?`,
          color: 0x7c3aed,
        },
      ],
      components: [row],
    });
  }
}
