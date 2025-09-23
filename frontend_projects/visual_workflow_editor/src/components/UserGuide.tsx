// 此组件的导览与快速入门已停用。
// 若需恢复，请参考 SSoT 文档的 re-enable 指南。保留导出以避免外部引用破裂。
// 注意：已移除 react-joyride、引导步骤与本地存储逻辑。

import type { FC } from 'react';

export interface UserGuideProps {
  className?: string;
}

const UserGuide: FC<UserGuideProps> = () => {
  // 停用版本：不渲染任何 UI，不进行任何副作用（包括本地存储、自动启动等）
  return null;
};

export default UserGuide;