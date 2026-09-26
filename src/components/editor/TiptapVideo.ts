import { Node, mergeAttributes } from "@tiptap/core";

// TipTap 官方没有视频节点：自实现一个块级原子 video 节点，
// 输出 <video controls src="..." class="rich-media"></video>，
// 与详情页 rich-content 样式、sanitizeRich 白名单保持一致。

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      setVideo: (options: { src: string; poster?: string | null }) => ReturnType;
    };
  }
}

export const TiptapVideo = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      poster: { default: null },
      class: { default: "rich-media" },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes({ controls: "controls" }, HTMLAttributes)];
  },

  addCommands() {
    return {
      setVideo:
        (options) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});
