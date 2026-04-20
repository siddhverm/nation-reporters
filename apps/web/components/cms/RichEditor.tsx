'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import {
  Bold, Italic, Heading2, List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Quote, Code,
} from 'lucide-react';

interface Props {
  content: object;
  onChange: (json: object) => void;
  editable?: boolean;
}

export function RichEditor({ content, onChange, editable = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    editable,
    onUpdate({ editor }) {
      onChange(editor.getJSON());
    },
  });

  if (!editor) return null;

  const btn = (active: boolean) =>
    `p-1.5 rounded hover:bg-gray-100 transition-colors ${active ? 'bg-gray-200 text-brand' : 'text-gray-600'}`;

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {editable && (
        <div className="flex flex-wrap gap-1 p-2 border-b bg-gray-50">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
            <Bold className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
            <Italic className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}>
            <Heading2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
            <List className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
            <ListOrdered className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))}>
            <Quote className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))}>
            <Code className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('URL:');
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }}
            className={btn(editor.isActive('link'))}
          >
            <LinkIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('Image URL:');
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }}
            className={btn(false)}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[300px] focus:outline-none"
      />
    </div>
  );
}
