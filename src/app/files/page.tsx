"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Download,
  Trash2,
  FileIcon,
  AlertCircle,
} from "lucide-react";

interface UserFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FilesPage() {
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    const res = await fetch("/api/files");
    if (res.ok) setFiles(await res.json());
    setLoaded(true);
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const e = await res.json();
        setError(e.error || "Upload failed.");
        return;
      }
      await loadFiles();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (file: UserFile) => {
    const confirmed = window.confirm(
      `Delete "${file.name}"? This cannot be undone.`
    );
    if (!confirmed) return;
    const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (res.ok) setFiles(files.filter((f) => f.id !== file.id));
    else alert("Failed to delete file.");
  };

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading file vault…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Statement Vault
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Original uploaded files stored in your isolated PostgreSQL vault
              (max 25 MB).
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1160px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[4px] border border-border bg-card p-5">
          <div
            className={`flex flex-col items-center justify-center gap-3 rounded-[2px] border border-dashed px-6 py-10 text-center transition-colors duration-120 ${
              dragOver
                ? "border-primary bg-accent/60"
                : "border-input bg-secondary/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleUpload(file);
            }}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Drag and drop a statement archive here, or choose a file to store.
            </p>
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Choose File"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-[2px] border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">
              Stored Files
            </h2>
          </div>
          {files.length === 0 ? (
            <div className="p-10 text-center text-xs text-muted-foreground">
              No files uploaded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">File Name</TableHead>
                  <TableHead>MIME Type</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="pr-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-[300px] truncate pl-5 text-xs font-medium">
                      <span className="inline-flex items-center gap-2">
                        <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {f.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {f.mimeType}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatSize(f.size)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(f.createdAt)}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          render={<a href={`/api/files/${f.id}/download`} />}
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(f)}
                          aria-label={`Delete ${f.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
