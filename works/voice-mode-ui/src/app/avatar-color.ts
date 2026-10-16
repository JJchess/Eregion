/**
 * 根据名称（用户名 / 角色名 / 显示名）派生稳定的 HSL 头像底色。
 * 在「参与者管理」「聊天消息默认头像」之间共用，确保同一身份在两处颜色一致。
 */
export function getAvatarBgColor(name: string | undefined | null): string {
  if (name == null || name === "") {
    return "hsl(220, 70%, 45%)";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}
