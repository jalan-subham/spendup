import StatementUploader from "@/components/StatementUploader";

export const metadata = {
  title: "ICICI PDF Import",
};

export default function ICICIImportPage() {
  return (
    <div className="py-8 bg-background min-h-screen">
      <div className="mx-auto max-w-5xl px-4 md:px-8 space-y-2 mb-8">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">ICICI PDF Parser</p>
        <h1 className="text-3xl font-bold tracking-tight">Upload Your Statement</h1>
      </div>
      <StatementUploader />
    </div>
  );
}
