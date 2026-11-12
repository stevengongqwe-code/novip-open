import React, {useRef, useState, type ReactNode} from 'react';

export interface TactileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  selectedFile?: File | null;
  selectedCount?: number;
  className?: string;
  children?: ReactNode;
}

export function formatFileSizeBadge(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * TactileDropzone — 双层微交互文件上传组件 (Aceternity UI #50 + Uiverse #28)
 * - 支持拖拽悬停脉冲激活态与点击唤起原生文件选择器
 * - 实时展示已选真实文件名、体积（KB/MB）与类型胶囊，绝不伪造文件状态
 */
export function TactileDropzone({
  accept,
  multiple = false,
  disabled = false,
  onFilesSelected,
  title = '点击选择文件，或直接拖到这里',
  subtitle = '100% 浏览器本机内存处理 · 不上传云端',
  selectedFile,
  selectedCount = 0,
  className = '',
  children,
}: TactileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  };

  return (
    <label
      className={`dropzone novip-tactile-dropzone ${dragActive ? 'is-drag-active is-dragover' : ''} ${className}`.trim()}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !dragActive) setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (!disabled) {
          handleFiles(e.dataTransfer?.files ?? null);
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="novip-dropzone-icon-wrap" aria-hidden="true">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
      {selectedFile && (
        <div className="novip-file-meta-pill" role="status">
          <span>📄 {selectedFile.name}</span>
          <span>· {formatFileSizeBadge(selectedFile.size)}</span>
          {selectedCount > 1 && <span>（共 {selectedCount} 份）</span>}
        </div>
      )}
      {children}
    </label>
  );
}
