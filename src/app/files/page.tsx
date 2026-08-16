"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, Trash2, FileIcon, AlertCircle } from "lucide-react";

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
      const res = await fetch("/api/files", { method: "POST", body: formData });
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
    const confirmed = window.confirm(`Delete "${file.name}"? This cannot be undone.`);
    if (!confirmed) return;
    const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (res.ok) setFiles(files.filter(f => f.id !== file.id));
    else alert("Failed to delete file.");
  };

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">Loading files...</div>;

  return (
    <div className="p-8 space-y-6 max-w-[1000px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Storage</p>
        <h1 className="text-2xl font-semibold tracking-tight">My Files</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Upload File</CardTitle>
          <CardDescription className="text-xs">Files are stored in your account and only visible to you. Max 25 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleUpload(file);
            }}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drag & drop a file here, or</p>
            <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Uploading..." : "Choose File"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>
          {error && (
            <div className="mt-3 bg-destructive/10 text-destructive text-sm p-3 rounded flex items-center gap-2">
              <AlertCircle size={14} />{error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Uploaded Files</CardTitle>
          <CardDescription className="text-xs">{files.length} file{files.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
              No files uploaded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Size</TableHead>
                  <TableHead className="text-xs">Uploaded</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium text-xs max-w-[300px] truncate">
                      <span className="inline-flex items-center gap-2">
                        <FileIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {f.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{f.mimeType}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatSize(f.size)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(f.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-[11px]" render={<a href={`/api/files/${f.id}/download`} />}>
                          <Download className="w-3.5 h-3.5 mr-1" /> Download
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={() => handleDelete(f)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}