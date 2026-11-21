# Retro Hotline

[打开 Retro Hotline](https://retro.oodai.space/)

打开页面进入纯白的主游戏空间。按 **P** 或点击右上角按钮，切换到独立的 **Dev Lab**。

- **光照与材质**可开关 GLSL 体积光、调节金属圆环粗糙度和开关 TSL 扫描纹。关闭体积光后，地面的窗格投影仍可见。启用「强制 WebGL2」可以用 WebGL2 运行同一个 TSL 材质。
- **概念模型**提供七个场景和两种机械的三维预览。选择模型后可旋转和缩放、查看三角面数，并与概念图并排对照。CRAW 和 BUG 提供带短慢动作的核心破裂预览。机械件使用 [Cutaway](https://github.com/Nyxera0x/cutaway) 的轮廓旋转工具构建轴承。各场景单独加载。[九张原图重构提示词与验收方法](docs/art/concept-rebuild.md)

## 本地开发

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```
