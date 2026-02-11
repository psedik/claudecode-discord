import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { getProject } from "../../db/database.js";
import { findSessionDir } from "./sessions.js";

export const data = new SlashCommandBuilder()
  .setName("clear-sessions")
  .setDescription("Delete all Claude Code session files for this project")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: "This channel is not registered to any project. Use `/register` first.",
    });
    return;
  }

  const sessionDir = findSessionDir(project.project_path);
  if (!sessionDir) {
    await interaction.editReply({
      content: `No session directory found for \`${project.project_path}\``,
    });
    return;
  }

  const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    await interaction.editReply({
      content: "No session files to delete.",
    });
    return;
  }

  let deleted = 0;
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(sessionDir, file));
      deleted++;
    } catch {
      // skip files that can't be deleted
    }
  }

  await interaction.editReply({
    embeds: [
      {
        title: "Sessions Cleared",
        description: [
          `Project: \`${project.project_path}\``,
          `Deleted **${deleted}** session file(s)`,
        ].join("\n"),
        color: 0xff6b6b,
      },
    ],
  });
}
