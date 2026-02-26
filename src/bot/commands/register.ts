import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import path from "node:path";
import { registerProject, getProject } from "../../db/database.js";
import { validateProjectPath } from "../../security/guard.js";
import { getConfig } from "../../utils/config.js";
import { L } from "../../utils/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("register")
  .setDescription("Register this channel to a project directory")
  .addStringOption((opt) =>
    opt
      .setName("path")
      .setDescription("Project folder name (under BASE_PROJECT_DIR)")
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const input = interaction.options.getString("path", true);
  const config = getConfig();
  // If input is absolute path, use as-is; otherwise join with base dir
  const projectPath = path.isAbsolute(input)
    ? input
    : path.join(config.BASE_PROJECT_DIR, input);
  const channelId = interaction.channelId;
  const guildId = interaction.guildId!;

  // Check if already registered
  const existing = getProject(channelId);
  if (existing) {
    await interaction.editReply({
      content: L(`This channel is already registered to \`${existing.project_path}\`. Use \`/unregister\` first.`, `이 채널은 이미 \`${existing.project_path}\`에 등록되어 있습니다. 먼저 \`/unregister\`를 사용하세요.`),
    });
    return;
  }

  // Validate path
  const error = validateProjectPath(projectPath);
  if (error) {
    await interaction.editReply({ content: L(`Invalid path: ${error}`, `잘못된 경로: ${error}`) });
    return;
  }

  registerProject(channelId, projectPath, guildId);

  await interaction.editReply({
    embeds: [
      {
        title: L("Project Registered", "프로젝트 등록됨"),
        description: L(`This channel is now linked to:\n\`${projectPath}\``, `이 채널이 연결되었습니다:\n\`${projectPath}\``),
        color: 0x00ff00,
        fields: [
          { name: L("Status", "상태"), value: L("🔴 Offline", "🔴 오프라인"), inline: true },
          { name: L("Auto-approve", "자동 승인"), value: L("Off", "꺼짐"), inline: true },
        ],
      },
    ],
  });
}
