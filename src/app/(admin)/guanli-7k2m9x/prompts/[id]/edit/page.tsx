"use client";

import { useParams } from "next/navigation";
import PromptForm from "@/components/admin/PromptForm";

export default function EditPage() {
  const params = useParams<{ id: string }>();
  return <PromptForm promptId={parseInt(params.id)} />;
}
