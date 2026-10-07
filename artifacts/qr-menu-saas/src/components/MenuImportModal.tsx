import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Upload,
  Camera,
  Image as ImageIcon,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  RefreshCw,
  AlertTriangle,
  Layers,
  Sparkles,
  X,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Check,
  Search,
  Eye,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Category, MenuItem } from "@workspace/api-client-react";
import { canUseFeature, getPlanLimits, normalizePlanId } from "@/lib/plans";

export type PreviewItem = {
  id: string;
  name: string;
  category: string;
  price: number | null;
  description: string;
  veg: boolean;
  isVegan?: boolean;
  isJain?: boolean;
  warning?: string;
  isDuplicate?: boolean;
  existingId?: string;
  duplicateAction?: "skip" | "update" | "create";
};

interface MenuImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  currency?: string;
  existingCategories: Category[];
  existingMenuItems: MenuItem[];
  onImportComplete: () => void;
  currentPlan?: string;
  onUpgrade?: () => void;
}

interface AiUsageStatus {
  allowed: boolean;
  requiresUpgrade: boolean;
  plan: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  date?: string;
  message?: string;
}

interface ValidatedImageFile {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  sizeFormatted: string;
}

export function MenuImportModal({
  isOpen,
  onClose,
  slug,
  currency = "₹",
  existingCategories,
  existingMenuItems,
  onImportComplete,
  currentPlan = "starter",
  onUpgrade,
}: MenuImportModalProps) {
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);

  // Tab: "snap" (camera AI scan) or "spreadsheet"
  const [activeTab, setActiveTab] = useState<"snap" | "spreadsheet">("snap");
  const [step, setStep] = useState<"upload" | "preview_photo" | "processing" | "review" | "importing" | "success">("upload");
  const [dragActive, setDragActive] = useState(false);
  const [showTips, setShowTips] = useState(false);

  // AI Usage state
  const [aiUsage, setAiUsage] = useState<AiUsageStatus | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  // Photo validation & files
  const [validatedImages, setValidatedImages] = useState<ValidatedImageFile[]>([]);
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingStepIndex, setProcessingStepIndex] = useState(0);

  // Review screen items
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [filterReview, setFilterReview] = useState<"all" | "warnings" | "duplicates">("all");
  const [searchFilter, setSearchFilter] = useState("");

  // Progress state
  const [importProgress, setImportProgress] = useState(0);
  const [successStats, setSuccessStats] = useState({ imported: 0, categories: 0, skipped: 0 });

  const normalizedPlan = normalizePlanId(currentPlan);
  const planLimits = getPlanLimits(normalizedPlan);
  const isSnapEntitled = canUseFeature(normalizedPlan, "ai_menu_extraction");

  // Fetch AI usage when modal opens
  const fetchAiUsage = async () => {
    try {
      setLoadingUsage(true);
      const token = await getIdToken();
      const res = await fetch(`/api/restaurants/${slug}/menu/ai-usage`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          setAiUsage(data);
        }
      }
    } catch (err) {
      console.warn("Could not fetch AI scan usage:", err);
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAiUsage();
      setStep("upload");
      setErrorMessage("");
      setValidatedImages([]);
      setSpreadsheetFile(null);
      setPreviewItems([]);
    }
  }, [isOpen, slug]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      validatedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, [validatedImages]);

  // Existing item names index for duplicate detection
  const existingNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of existingMenuItems) {
      if (item.name) {
        map.set(item.name.trim().toLowerCase(), item.id);
      }
    }
    return map;
  }, [existingMenuItems]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Client-side image validation (decodability, dimensions, size, mimeType)
  const validateAndAddImages = async (fileList: FileList | File[], append = false) => {
    setErrorMessage("");
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (!append && files.length > 3) {
      setErrorMessage("Please select up to 3 menu photos at once.");
      return;
    }
    if (append && validatedImages.length + files.length > 3) {
      setErrorMessage("Maximum 3 menu pages allowed per scan session.");
      return;
    }

    const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    const newValidated: ValidatedImageFile[] = [];

    for (const file of files) {
      // 1. MimeType Check
      if (!acceptedTypes.includes(file.type.toLowerCase()) && !file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
        setErrorMessage(`"${file.name}" is not a supported image. Please upload JPG, PNG, or WebP.`);
        return;
      }

      // 2. File size check (max 15MB)
      if (file.size > 15 * 1024 * 1024) {
        setErrorMessage(`"${file.name}" exceeds the 15MB limit (${formatFileSize(file.size)}). Please upload a smaller photo.`);
        return;
      }

      // 3. Image Decode & Resolution Check
      try {
        const previewUrl = URL.createObjectURL(file);
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("Image decode failed"));
          img.src = previewUrl;
        });

        if (dimensions.width < 200 || dimensions.height < 200) {
          URL.revokeObjectURL(previewUrl);
          setErrorMessage(`"${file.name}" is too low resolution (${dimensions.width}x${dimensions.height}px). Minimum resolution is 200x200px for accurate text detection.`);
          return;
        }

        newValidated.push({
          file,
          previewUrl,
          width: dimensions.width,
          height: dimensions.height,
          sizeFormatted: formatFileSize(file.size),
        });
      } catch {
        setErrorMessage(`"${file.name}" appears corrupted or unreadable. Please choose another photo.`);
        return;
      }
    }

    if (append) {
      setValidatedImages((prev) => [...prev, ...newValidated]);
    } else {
      validatedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setValidatedImages(newValidated);
      setStep("preview_photo");
    }
  };

  const handleRemovePhoto = (index: number) => {
    setValidatedImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const remaining = prev.filter((_, i) => i !== index);
      if (remaining.length === 0) {
        setStep("upload");
      }
      return remaining;
    });
  };

  const optimizeAndReadImageAsBase64 = async (
    file: File
  ): Promise<{ data: string; mimeType: string; filename: string }> => {
    // If not a standard browser-decodable image, fall back to direct FileReader
    if (!file.type.startsWith("image/") && !file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            data: reader.result as string,
            mimeType: file.type || "application/octet-stream",
            filename: file.name,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      const fallbackRead = () => {
        URL.revokeObjectURL(objectUrl);
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            data: reader.result as string,
            mimeType: file.type || "image/jpeg",
            filename: file.name,
          });
        };
        reader.onerror = () => {
          resolve({
            data: "",
            mimeType: file.type || "image/jpeg",
            filename: file.name,
          });
        };
        reader.readAsDataURL(file);
      };

      img.onload = () => {
        try {
          const maxDim = 2048;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            fallbackRead();
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
          URL.revokeObjectURL(objectUrl);
          resolve({
            data: dataUrl,
            mimeType: "image/jpeg",
            filename: file.name.replace(/\.[^.]+$/, ".jpg"),
          });
        } catch {
          fallbackRead();
        }
      };

      img.onerror = () => {
        fallbackRead();
      };

      img.src = objectUrl;
    });
  };

  // Execute Snap to Menu AI Scan
  const handleStartAiScan = async () => {
    if (validatedImages.length === 0) return;
    setStep("processing");
    setErrorMessage("");
    setProcessingStatus("Preparing and optimizing menu photos...");
    setProcessingStepIndex(0);

    const stepInterval = setInterval(() => {
      setProcessingStepIndex((prev) => {
        const next = (prev + 1) % 3;
        if (next === 0) setProcessingStatus("Analyzing menu layout and typography...");
        if (next === 1) setProcessingStatus("Extracting categories, dishes, and prices...");
        if (next === 2) setProcessingStatus("Checking dietary symbols and culinary descriptions...");
        return next;
      });
    }, 1800);

    try {
      const payloadFiles = await Promise.all(validatedImages.map((v) => optimizeAndReadImageAsBase64(v.file)));
      const token = await getIdToken();

      const response = await fetch(`/api/restaurants/${slug}/menu/ai-extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ files: payloadFiles }),
      });

      clearInterval(stepInterval);

      const contentType = response.headers.get("content-type") || "";
      let responseBody: any = null;

      if (contentType.includes("application/json")) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Daily AI menu scan limit reached (3/3). Please try again tomorrow or enter items manually.");
        }
        if (
          response.status === 403 &&
          (responseBody?.error?.code === "PLAN_LIMITATION" || responseBody?.code === "PLAN_LIMITATION")
        ) {
          throw new Error("Starter plan does not include Snap to Menu AI scanning. Please upgrade to Growth or Pro.");
        }
        if (response.status === 413) {
          throw new Error("The uploaded image file is too large. Please upload smaller photos (max 25MB total).");
        }
        if (response.status === 504 || response.status === 408) {
          throw new Error("The AI menu scan timed out. Please try uploading a single, clear page photo.");
        }
        const errMessage =
          responseBody?.error?.message ||
          responseBody?.message ||
          (typeof responseBody?.error === "string" ? responseBody.error : undefined) ||
          "Failed to extract menu items from photo. Please verify lighting and clarity.";
        throw new Error(errMessage);
      }

      if (!responseBody) {
        throw new Error("The server returned an unexpected response. Please try again with a clear photo.");
      }

      const extracted = responseBody.extractedItems || [];

      if (extracted.length === 0) {
        throw new Error("No readable dishes were found in the uploaded photo. Please ensure text is clear, well-lit, and in focus.");
      }

      // Convert extracted items to Review items with duplicate and warning detection
      const reviewList: PreviewItem[] = extracted.map((item: any, idx: number) => {
        const cleanName = String(item.name || "").trim();
        const existingId = cleanName ? existingNamesMap.get(cleanName.toLowerCase()) : undefined;
        const isDuplicate = !!existingId;

        let warning = item.requiresReview ? item.reviewReason || "Unclear item" : undefined;
        if (item.price === null || item.price === undefined) {
          warning = "Price missing or unreadable";
        }

        return {
          id: `ai_${Date.now()}_${idx}`,
          name: cleanName,
          category: String(item.category || "General").trim(),
          price: item.price !== null && !isNaN(Number(item.price)) ? Number(item.price) : null,
          description: String(item.description || "").trim(),
          veg: item.veg !== false,
          isVegan: !!item.isVegan,
          isJain: !!item.isJain,
          warning,
          isDuplicate,
          existingId,
          duplicateAction: isDuplicate ? "skip" : undefined,
        };
      });

      setPreviewItems(reviewList);
      setStep("review");
      fetchAiUsage(); // Refresh usage count in background
    } catch (err: any) {
      clearInterval(stepInterval);
      setErrorMessage(err.message || "An unexpected error occurred during extraction.");
      setStep("preview_photo");
    }
  };

  // Spreadsheet Processing Flow
  const handleStartSpreadsheetProcessing = async () => {
    if (!spreadsheetFile) return;
    setStep("processing");
    setErrorMessage("");
    setProcessingStatus("Parsing spreadsheet data...");

    try {
      const buffer = await spreadsheetFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

      if (rawRows.length === 0) {
        throw new Error("The selected spreadsheet has no data rows.");
      }

      const reviewList: PreviewItem[] = [];
      for (let idx = 0; idx < rawRows.length; idx++) {
        const row = rawRows[idx];
        const keys = Object.keys(row);
        const findKey = (candidates: string[]) =>
          keys.find((k) => candidates.some((c) => k.toLowerCase().includes(c.toLowerCase())));

        const nameKey = findKey(["dish name", "dish", "item name", "item", "name", "title"]);
        const catKey = findKey(["category", "section", "course", "group"]);
        const priceKey = findKey(["price", "rate", "cost", "amount", "mrp"]);
        const descKey = findKey(["desc", "description", "details"]);
        const vegKey = findKey(["veg", "vegetarian", "dietary"]);

        const rawName = nameKey ? String(row[nameKey]).trim() : "";
        if (!rawName) continue;

        const rawCat = catKey ? String(row[catKey]).trim() : "General";
        let parsedPrice: number | null = null;
        if (priceKey && row[priceKey] !== "") {
          const num = Number(String(row[priceKey]).replace(/[^0-9.]/g, ""));
          if (!isNaN(num) && num >= 0) parsedPrice = num;
        }

        const rawVegStr = vegKey ? String(row[vegKey]).toLowerCase() : "";
        let isVeg = true;
        if (rawVegStr.includes("non") || rawVegStr.includes("nv") || rawVegStr === "0" || rawVegStr === "false") {
          isVeg = false;
        }

        const existingId = existingNamesMap.get(rawName.toLowerCase());
        const isDuplicate = !!existingId;

        reviewList.push({
          id: `sheet_${idx}`,
          name: rawName,
          category: rawCat || "General",
          price: parsedPrice,
          description: descKey ? String(row[descKey]).trim() : "",
          veg: isVeg,
          warning: parsedPrice === null ? "Missing price" : undefined,
          isDuplicate,
          existingId,
          duplicateAction: isDuplicate ? "skip" : undefined,
        });
      }

      if (reviewList.length === 0) {
        throw new Error("Could not find valid dish rows in this spreadsheet. Please ensure columns include Name and Price.");
      }

      setPreviewItems(reviewList);
      setStep("review");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to read spreadsheet file.");
      setStep("upload");
    }
  };

  // Sample CSV Template Download
  const handleDownloadSampleCsv = () => {
    const csvContent =
      "Category,Name,Price,Description,Dietary,SpicyLevel,Available\n" +
      "Starters,Paneer Tikka,280,Fresh cottage cheese marinated in curd and aromatic spices,Veg,Mild,true\n" +
      "Starters,Murgh Malai Tikka,340,Tender chicken morsels steeped in cream and cardamom,Non-Veg,None,true\n" +
      "Mains,Dal Makhani,260,Black lentils slow-cooked overnight with churned butter,Veg,None,true\n" +
      "Mains,Butter Chicken,380,Tandoori chicken in a velvet tomato and fenugreek gravy,Non-Veg,Mild,true\n" +
      "Breads,Garlic Naan,60,Crisp leavened bread layered with roasted garlic and butter,Veg,None,true\n" +
      "Beverages,Cold Coffee,140,Slow-churned iced espresso with vanilla bean ice cream,Veg,None,true\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "tableline_menu_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Review manipulation
  const handleUpdateItem = (id: string, partial: Partial<PreviewItem>) => {
    setPreviewItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...partial };
        if (updated.price !== null && updated.warning === "Price missing or unreadable") {
          updated.warning = undefined;
        }
        return updated;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    setPreviewItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAddNewItem = () => {
    const newItem: PreviewItem = {
      id: `manual_${Date.now()}`,
      name: "New Dish",
      category: existingCategories[0]?.name || "Main Course",
      price: 100,
      description: "",
      veg: true,
      warning: undefined,
    };
    setPreviewItems((prev) => [newItem, ...prev]);
  };

  // Filtered review list
  const filteredPreview = useMemo(() => {
    return previewItems.filter((item) => {
      if (filterReview === "warnings" && !item.warning) return false;
      if (filterReview === "duplicates" && !item.isDuplicate) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCat = item.category.toLowerCase().includes(q);
        if (!matchesName && !matchesCat) return false;
      }
      return true;
    });
  }, [previewItems, filterReview, searchFilter]);

  const warningCount = previewItems.filter((i) => !!i.warning).length;
  const duplicateCount = previewItems.filter((i) => !!i.isDuplicate).length;

  // Plan item limits calculation
  const totalItemsAfterImport =
    importMode === "replace"
      ? previewItems.length
      : existingMenuItems.length + previewItems.length;

  const isExceedingPlanLimit =
    planLimits.maxMenuItems < 999999 && totalItemsAfterImport > planLimits.maxMenuItems;

  // Commit items to database
  const handleCommitImport = async () => {
    if (importMode === "replace" && !showReplaceConfirm) {
      setShowReplaceConfirm(true);
      return;
    }

    if (isExceedingPlanLimit) {
      toast({
        title: "Plan Item Limit Exceeded",
        description: `Your ${normalizedPlan} plan allows up to ${planLimits.maxMenuItems} items. Please remove items or upgrade your plan.`,
        variant: "destructive",
      });
      return;
    }

    setStep("importing");
    setImportProgress(20);

    try {
      const itemsToSave = previewItems.map((item) => ({
        name: item.name.trim(),
        category: item.category.trim() || "General",
        price: item.price ?? 0,
        description: item.description.trim(),
        veg: item.veg,
        isVegan: item.isVegan,
        isJain: item.isJain,
        available: true,
        duplicateAction: item.duplicateAction,
        existingId: item.existingId,
      }));

      const progressInterval = setInterval(() => {
        setImportProgress((p) => (p < 85 ? p + 15 : p));
      }, 300);

      const token = await getIdToken();
      const res = await fetch(`/api/restaurants/${slug}/menu/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mode: importMode,
          items: itemsToSave,
        }),
      });

      clearInterval(progressInterval);
      setImportProgress(100);

      const contentType = res.headers.get("content-type") || "";
      let resBody: any = null;
      if (contentType.includes("application/json")) {
        try {
          resBody = await res.json();
        } catch {
          resBody = null;
        }
      }

      if (!res.ok) {
        const errMessage =
          resBody?.error?.message ||
          resBody?.message ||
          (typeof resBody?.error === "string" ? resBody.error : undefined) ||
          "Failed to publish items to menu.";
        throw new Error(errMessage);
      }

      const result = resBody || {};
      setSuccessStats({
        imported: result.importedCount ?? itemsToSave.length,
        categories: result.categoriesCreated ?? new Set(itemsToSave.map((i) => i.category)).size,
        skipped: result.skippedCount ?? 0,
      });

      setStep("success");
      toast({
        title: "Menu Published!",
        description: `Successfully added ${itemsToSave.length} dishes to your menu.`,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Could not publish imported menu items.");
      setStep("review");
      toast({
        title: "Import Error",
        description: err.message || "Failed to save menu items.",
        variant: "destructive",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#fdfbf7] text-[#1c1917] rounded-3xl border border-border/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-[#faf7f2]/80">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-900 border border-amber-200/80 shadow-2xs">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold tracking-tight text-[#1c1917]">
                  {step === "review"
                    ? "Review Menu Items"
                    : step === "preview_photo"
                    ? "Confirm Menu Photo"
                    : step === "processing"
                    ? "Scanning Menu..."
                    : "Import Menu"}
                </h2>
                {step === "upload" && (
                  <span className="rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-[11px] font-bold border border-amber-200/80">
                    Snap to Menu AI
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {step === "review"
                  ? "Carefully verify extracted items and prices before publishing to your live QR menu."
                  : step === "preview_photo"
                  ? "Ensure menu text is clear and readable before starting the AI scan."
                  : "Turn your printed physical menu or spreadsheet into a digital menu in minutes."}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
            id="button-close-menu-import"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* MODE TABS (Only in upload step) */}
        {step === "upload" && (
          <div className="flex border-b border-border/70 bg-[#faf7f2]/50 px-6 pt-2">
            <button
              onClick={() => {
                setActiveTab("snap");
                setErrorMessage("");
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                activeTab === "snap"
                  ? "border-[#1c1917] text-[#1c1917]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              id="tab-snap-to-menu"
            >
              <Camera className="h-4 w-4 text-amber-800" />
              <span>Snap to Menu (AI Photo)</span>
              {aiUsage && !aiUsage.requiresUpgrade && (
                <span className="ml-1 rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-semibold">
                  {aiUsage.remainingToday}/3 today
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveTab("spreadsheet");
                setErrorMessage("");
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                activeTab === "spreadsheet"
                  ? "border-[#1c1917] text-[#1c1917]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              id="tab-spreadsheet-import"
            >
              <FileSpreadsheet className="h-4 w-4 text-blue-700" />
              <span>Spreadsheet / File (CSV/XLSX)</span>
            </button>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ERROR ALERT */}
          {errorMessage && (
            <div className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{errorMessage}</p>
              </div>
              <button onClick={() => setErrorMessage("")} className="text-destructive/70 hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* STEP 1: UPLOAD (TAB: SNAP TO MENU) */}
          {step === "upload" && activeTab === "snap" && (
            <div className="space-y-6 max-w-2xl mx-auto py-2">
              {/* Entitlement Gate (Plan restriction) */}
              {(!isSnapEntitled || aiUsage?.requiresUpgrade) ? (
                <div className="rounded-3xl border border-amber-200/90 bg-amber-50/70 p-6 text-center space-y-4">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-900 border border-amber-200">
                    <Sparkles className="h-7 w-7 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-amber-950">
                      Upgrade to Growth to use Snap to Menu
                    </h3>
                    <p className="mt-1 text-xs text-amber-900/80 max-w-md mx-auto leading-relaxed">
                      Your current <strong>Starter</strong> plan allows up to 50 items with manual entry.
                      Upgrade to <strong>Growth</strong> or <strong>Pro</strong> to unlock instant AI menu scanning,
                      spreadsheet imports, and higher catalog limits.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="rounded-xl text-xs border-amber-300 bg-white hover:bg-amber-100/50"
                    >
                      Enter Dishes Manually
                    </Button>
                    <Button
                      onClick={() => {
                        onClose();
                        if (onUpgrade) onUpgrade();
                      }}
                      className="rounded-xl text-xs font-bold bg-[#1c1917] text-[#fdfbf7] hover:bg-[#292524] shadow-xs"
                      id="button-upgrade-for-snap"
                    >
                      Upgrade to Growth
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Daily Rate Limit Banner if 0 remaining */}
                  {aiUsage && aiUsage.remainingToday <= 0 ? (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 flex items-start gap-3 shadow-2xs">
                      <AlertTriangle className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="font-bold text-amber-900">
                          Daily AI menu scan limit reached (3/3)
                        </p>
                        <p className="text-amber-800 leading-relaxed">
                          You have used all 3 AI menu scans for today. Your quota resets at midnight.
                          You can still add dishes manually or import a spreadsheet.
                        </p>
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onClose}
                            className="h-8 rounded-lg text-xs border-amber-300 bg-white hover:bg-amber-100"
                          >
                            Enter Items Manually
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setActiveTab("spreadsheet")}
                            className="h-8 rounded-lg text-xs bg-amber-900 text-white hover:bg-amber-950"
                          >
                            Import via Spreadsheet
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Daily Usage Badge */
                    <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-white/70 px-4 py-2.5 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-[#1c1917]">Snap to Menu AI</span>
                        <span className="text-xs text-muted-foreground">· Turn physical menu into digital</span>
                      </div>
                      <div className="text-xs font-semibold text-stone-700 bg-secondary/60 px-2.5 py-1 rounded-lg">
                        AI scans remaining:{" "}
                        <strong className="text-emerald-700 font-bold">
                          {aiUsage ? `${aiUsage.remainingToday}/${aiUsage.dailyLimit}` : "3/3"} today
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* MAIN UPLOAD / CAMERA CARD */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files) {
                        validateAndAddImages(e.dataTransfer.files);
                      }
                    }}
                    className={`relative rounded-3xl border-2 border-dashed p-8 text-center transition-all bg-white shadow-2xs ${
                      dragActive
                        ? "border-[#1c1917] bg-secondary/30 scale-[1.01]"
                        : "border-border/80 hover:border-border"
                    } ${aiUsage && aiUsage.remainingToday <= 0 ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-900 border border-amber-200/80 mb-4 shadow-xs">
                      <Camera className="h-8 w-8 text-amber-800" />
                    </div>

                    <h3 className="font-display text-xl font-bold text-[#1c1917]">
                      Upload a menu photo
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                      Take a picture with your phone camera or upload a clear photo from your files.
                    </p>

                    {/* DUAL ACTION BUTTONS */}
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      {/* Button 1: Take Photo with Camera */}
                      <Button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="rounded-xl text-xs font-bold bg-[#1c1917] text-[#fdfbf7] hover:bg-[#292524] h-11 px-5 shadow-xs"
                        id="button-snap-camera"
                      >
                        <Camera className="h-4 w-4 mr-2 text-amber-300" />
                        Take Photo with Camera
                      </Button>

                      {/* Button 2: Upload Menu Photo from Gallery */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => galleryInputRef.current?.click()}
                        className="rounded-xl text-xs font-semibold h-11 px-5 border-border bg-white hover:bg-secondary/60 shadow-2xs"
                        id="button-upload-menu-photo"
                      >
                        <ImageIcon className="h-4 w-4 mr-2 text-stone-600" />
                        Upload from Photos
                      </Button>
                    </div>

                    {/* Hidden Inputs */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) validateAndAddImages(e.target.files);
                      }}
                    />
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) validateAndAddImages(e.target.files);
                      }}
                    />

                    <p className="mt-4 text-[11px] text-muted-foreground">
                      JPG, PNG, or WebP up to 15MB. Minimum 200x200px resolution.
                    </p>
                  </div>

                  {/* TIPS ACCORDION */}
                  <div className="rounded-2xl border border-border/80 bg-white/70 overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowTips(!showTips)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-stone-700 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-amber-700" />
                        <span>Tips for the highest extraction accuracy</span>
                      </div>
                      {showTips ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {showTips && (
                      <div className="border-t border-border/60 bg-[#faf7f2]/50 p-4 text-xs text-muted-foreground space-y-2">
                        <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
                          <li><strong>Keep the entire menu visible:</strong> Capture headers, categories, and item prices together.</li>
                          <li><strong>Avoid glare & reflections:</strong> Tilt glossy laminated menus slightly away from direct overhead spotlights.</li>
                          <li><strong>Keep text sharp & focused:</strong> Tap your phone screen to focus on the text before taking the shot.</li>
                          <li><strong>Shoot straight-on:</strong> Align the camera flat with the menu page rather than shooting at an angle.</li>
                          <li><strong>Good lighting:</strong> Ensure balanced, even illumination without heavy shadows across dish names.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 1 (TAB: SPREADSHEET / CSV) */}
          {step === "upload" && activeTab === "spreadsheet" && (
            <div className="space-y-6 max-w-2xl mx-auto py-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.[0]) {
                    setSpreadsheetFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`rounded-3xl border-2 border-dashed p-8 text-center bg-white shadow-2xs transition-all ${
                  dragActive ? "border-[#1c1917] bg-secondary/30 scale-[1.01]" : "border-border/80"
                }`}
              >
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-800 border border-blue-100 mb-4">
                  <FileSpreadsheet className="h-8 w-8 text-blue-700" />
                </div>
                <h3 className="font-display text-xl font-bold text-[#1c1917]">
                  Upload CSV or Excel Spreadsheet
                </h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  Import hundreds of dishes with categories, prices, descriptions, and dietary flags in one click.
                </p>

                {spreadsheetFile ? (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-secondary/70 px-4 py-2 text-xs font-semibold">
                    <FileSpreadsheet className="h-4 w-4 text-blue-700" />
                    <span>{spreadsheetFile.name}</span>
                    <span className="text-muted-foreground">({formatFileSize(spreadsheetFile.size)})</span>
                    <button
                      onClick={() => setSpreadsheetFile(null)}
                      className="ml-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-5">
                    <Button
                      type="button"
                      onClick={() => spreadsheetInputRef.current?.click()}
                      className="rounded-xl text-xs font-bold bg-[#1c1917] text-[#fdfbf7] hover:bg-[#292524] h-11 px-5 shadow-xs"
                      id="button-select-spreadsheet"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Browse Spreadsheet File
                    </Button>
                  </div>
                )}

                <input
                  ref={spreadsheetInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setSpreadsheetFile(e.target.files[0]);
                  }}
                />

                <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-center gap-4 text-xs">
                  <span className="text-muted-foreground">Need a starting template?</span>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-1.5 font-bold text-amber-900 hover:underline"
                    id="button-download-sample-csv"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Sample CSV
                  </button>
                </div>
              </div>

              {spreadsheetFile && (
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setSpreadsheetFile(null)}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStartSpreadsheetProcessing}
                    className="rounded-xl text-xs font-bold bg-[#1c1917] text-[#fdfbf7] hover:bg-[#292524] px-6"
                    id="button-parse-spreadsheet"
                  >
                    Parse Spreadsheet Items
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PHOTO PREVIEW (BEFORE AI SCAN) */}
          {step === "preview_photo" && (
            <div className="space-y-6 max-w-2xl mx-auto py-2">
              <div className="rounded-2xl border border-border/80 bg-white/70 p-4 shadow-2xs flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-[#1c1917]">Photo Ready for AI Scan</h3>
                  <p className="text-xs text-muted-foreground">
                    Review your menu photo before running the extraction. No changes will be saved to your menu until you confirm.
                  </p>
                </div>
                {aiUsage && (
                  <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    {aiUsage.remainingToday}/3 scans remaining
                  </span>
                )}
              </div>

              {/* Photo Previews Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {validatedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-2xl border border-border bg-white overflow-hidden shadow-2xs group"
                  >
                    <div className="relative aspect-4/3 bg-stone-100 overflow-hidden flex items-center justify-center">
                      <img
                        src={img.previewUrl}
                        alt={`Menu Page ${idx + 1}`}
                        className="object-contain w-full h-full"
                      />
                      <div className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white tracking-wider uppercase">
                        Page {idx + 1}
                      </div>
                      <button
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-white hover:bg-destructive transition-colors"
                        title="Remove page"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="p-3 text-xs flex items-center justify-between text-muted-foreground border-t border-border/60">
                      <span className="font-mono text-[11px]">{img.width} × {img.height} px</span>
                      <span>{img.sizeFormatted}</span>
                    </div>
                  </div>
                ))}

                {/* Add Page Slot if < 3 */}
                {validatedImages.length < 3 && (
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="rounded-2xl border-2 border-dashed border-border/80 hover:border-[#1c1917] p-6 flex flex-col items-center justify-center text-center transition-colors bg-white/40 hover:bg-white min-h-[160px]"
                  >
                    <Plus className="h-6 w-6 text-stone-500 mb-1" />
                    <span className="text-xs font-bold text-[#1c1917]">Add Another Page</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">e.g. Back page or dessert sheet</span>
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/70">
                <Button
                  variant="outline"
                  onClick={() => {
                    setValidatedImages([]);
                    setStep("upload");
                  }}
                  className="rounded-xl text-xs h-10"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Choose Different Photo
                </Button>

                <Button
                  onClick={handleStartAiScan}
                  className="rounded-xl text-xs font-bold bg-[#1c1917] text-[#fdfbf7] hover:bg-[#292524] h-11 px-6 shadow-xs"
                  id="button-start-ai-scan"
                >
                  <Camera className="h-4 w-4 mr-2 text-amber-300" />
                  Scan Menu with AI (1 scan)
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING STATE */}
          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-5 max-w-md mx-auto">
              <div className="relative">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-900 border border-amber-200 shadow-xs animate-pulse">
                  <Sparkles className="h-8 w-8 text-amber-700" />
                </div>
                <div className="absolute -inset-2 rounded-3xl border border-amber-300/40 animate-ping opacity-25" />
              </div>

              <div>
                <h3 className="font-display text-xl font-bold text-[#1c1917]">
                  {processingStatus || "Digitizing your menu..."}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Our culinary model is reading dishes, prices, and dietary symbols. This usually takes 5-10 seconds.
                </p>
              </div>

              {/* Calming progress steps */}
              <div className="w-full bg-secondary/50 rounded-2xl p-4 border border-border/60 text-left space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-[#1c1917]">Image uploaded and pre-processed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 grid place-items-center rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">2</span>
                  <span className="font-medium text-amber-900">Extracting categories, dishes, and prices...</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-4 w-4 grid place-items-center rounded-full bg-secondary text-[10px]">3</span>
                  <span>Generating review catalog</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW ITEMS SCREEN */}
          {step === "review" && (
            <div className="space-y-4">
              {/* PLAN LIMIT WARNING BANNER */}
              {isExceedingPlanLimit && (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                    <div>
                      <p className="font-bold text-sm">Catalog Limit Exceeded</p>
                      <p className="mt-0.5 leading-relaxed">
                        Your <strong>{normalizedPlan}</strong> plan allows up to <strong>{planLimits.maxMenuItems}</strong> dishes.
                        Importing these {previewItems.length} items would result in <strong>{totalItemsAfterImport} total items</strong>{" "}
                        ({existingMenuItems.length} existing + {previewItems.length} new).
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Please delete or trim items below to fit within your limit, or upgrade to <strong>Pro</strong> for unlimited dishes.
                      </p>
                    </div>
                  </div>
                  {onUpgrade && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={onUpgrade}
                        className="rounded-xl text-xs font-bold bg-destructive text-white hover:bg-destructive/90"
                      >
                        Upgrade to Pro Plan
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* REVIEW STATS & FILTER BAR */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-border/80 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search Filter */}
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Filter dishes or categories..."
                      className="h-8 w-52 pl-8 text-xs rounded-xl border-border"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex rounded-xl border border-border p-0.5 bg-secondary/30 text-xs">
                    <button
                      onClick={() => setFilterReview("all")}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                        filterReview === "all" ? "bg-white font-bold shadow-2xs text-[#1c1917]" : "text-muted-foreground"
                      }`}
                    >
                      All ({previewItems.length})
                    </button>
                    {warningCount > 0 && (
                      <button
                        onClick={() => setFilterReview("warnings")}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                          filterReview === "warnings"
                            ? "bg-white font-bold shadow-2xs text-amber-800"
                            : "text-amber-700"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Needs Review ({warningCount})
                      </button>
                    )}
                    {duplicateCount > 0 && (
                      <button
                        onClick={() => setFilterReview("duplicates")}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                          filterReview === "duplicates"
                            ? "bg-white font-bold shadow-2xs text-blue-800"
                            : "text-blue-700"
                        }`}
                      >
                        <Layers className="h-3 w-3" />
                        Duplicates ({duplicateCount})
                      </button>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddNewItem}
                  className="h-8 rounded-xl text-xs border-border bg-white hover:bg-secondary/40 font-semibold"
                  id="button-add-missing-dish"
                >
                  <Plus className="h-3.5 w-3.5 mr-1 text-stone-600" /> Add Missing Dish
                </Button>
              </div>

              {/* EDITABLE REVIEW TABLE */}
              <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-2xs">
                <div className="max-h-[46vh] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#fdfbf7] border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">Diet</th>
                        <th className="py-2.5 px-3 w-36">Category</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Dish Name</th>
                        <th className="py-2.5 px-3 w-28">Price ({currency})</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                        <th className="py-2.5 px-3 w-36">Status</th>
                        <th className="py-2.5 px-3 text-right w-12">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredPreview.map((item) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-secondary/20 transition-colors ${
                            item.warning ? "bg-amber-50/50" : item.isDuplicate ? "bg-blue-50/40" : ""
                          }`}
                        >
                          {/* Diet Toggle */}
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleUpdateItem(item.id, { veg: !item.veg })}
                              className={`h-6 w-6 rounded-md grid place-items-center border text-[10px] font-bold mx-auto transition-transform active:scale-95 ${
                                item.veg
                                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                                  : "border-amber-800 bg-amber-50 text-amber-900"
                              }`}
                              title={item.veg ? "Vegetarian (click to change)" : "Non-Vegetarian (click to change)"}
                            >
                              {item.veg ? "V" : "NV"}
                            </button>
                          </td>

                          {/* Category */}
                          <td className="py-2 px-3">
                            <input
                              value={item.category}
                              onChange={(e) => handleUpdateItem(item.id, { category: e.target.value })}
                              placeholder="Category..."
                              className="h-8 w-full rounded-lg border border-border/80 bg-white px-2 text-xs focus:ring-1 focus:ring-[#1c1917]"
                            />
                          </td>

                          {/* Dish Name */}
                          <td className="py-2 px-3">
                            <input
                              value={item.name}
                              onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                              placeholder="Dish name..."
                              className="h-8 w-full rounded-lg border border-border/80 bg-white px-2 font-medium text-xs focus:ring-1 focus:ring-[#1c1917]"
                            />
                          </td>

                          {/* Price */}
                          <td className="py-2 px-3">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.price ?? ""}
                                placeholder="0"
                                onChange={(e) => {
                                  const val = e.target.value === "" ? null : Number(e.target.value);
                                  handleUpdateItem(item.id, { price: val });
                                }}
                                className={`h-8 w-full rounded-lg border px-2 font-mono text-xs focus:ring-1 focus:ring-[#1c1917] ${
                                  item.price === null ? "border-amber-500 bg-amber-50 text-amber-900 font-bold" : "border-border/80 bg-white"
                                }`}
                              />
                            </div>
                          </td>

                          {/* Description */}
                          <td className="py-2 px-3">
                            <input
                              value={item.description}
                              onChange={(e) => handleUpdateItem(item.id, { description: e.target.value })}
                              placeholder="Description or ingredients..."
                              className="h-8 w-full rounded-lg border border-border/80 bg-white px-2 text-xs text-muted-foreground focus:ring-1 focus:ring-[#1c1917]"
                            />
                          </td>

                          {/* Status / Duplicate Handling */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            {item.isDuplicate ? (
                              <select
                                value={item.duplicateAction || "skip"}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    duplicateAction: e.target.value as any,
                                  })
                                }
                                className="h-7 rounded-lg border border-blue-300 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-900"
                              >
                                <option value="skip">Skip Duplicate</option>
                                <option value="update">Update Price</option>
                                <option value="create">Add as New</option>
                              </select>
                            ) : item.warning ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-200">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                {item.warning}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3 shrink-0" /> Ready
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ml-auto"
                              title="Delete row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FOOTER ACTIONS & IMPORT MODE */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 bg-[#fdfbf7]">
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-semibold text-muted-foreground">Mode:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "merge"}
                      onChange={() => setImportMode("merge")}
                    />
                    <span>Add to existing menu (merge)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-amber-900">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                    />
                    <span>Replace entire menu</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (validatedImages.length > 0) {
                        setStep("preview_photo");
                      } else {
                        setStep("upload");
                      }
                    }}
                    className="h-10 rounded-xl text-xs border-border"
                  >
                    Discard & Back
                  </Button>
                  <Button
                    onClick={handleCommitImport}
                    disabled={isExceedingPlanLimit || previewItems.length === 0}
                    className="h-10 rounded-xl bg-[#1c1917] text-[#fdfbf7] font-bold text-xs hover:bg-[#292524] px-6 shadow-xs disabled:opacity-50"
                    id="button-publish-menu-items"
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Publish {previewItems.length} Dishes to Menu
                  </Button>
                </div>
              </div>

              {/* Replace Confirmation Modal */}
              {showReplaceConfirm && (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-xs space-y-3">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-bold">Are you sure you want to replace the entire menu?</p>
                      <p className="text-muted-foreground">
                        This will remove your current dishes and replace them with the {previewItems.length} dishes from this scan.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReplaceConfirm(false)}
                      className="h-8 rounded-lg text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setShowReplaceConfirm(false);
                        handleCommitImport();
                      }}
                      className="h-8 rounded-lg text-xs"
                    >
                      Yes, Replace Menu
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: IMPORTING PROGRESS */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-md mx-auto">
              <div className="w-full bg-secondary h-3 rounded-full overflow-hidden">
                <div
                  className="bg-[#1c1917] h-full transition-all duration-300 rounded-full"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <h3 className="font-display text-lg font-bold">Publishing dishes to your live menu...</h3>
              <p className="text-xs text-muted-foreground">
                Saving categories, dishes, prices, and dietary flags securely into the database.
              </p>
            </div>
          )}

          {/* STEP 6: SUCCESS */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 shadow-xs">
                <CheckCircle2 className="h-8 w-8 text-emerald-700" />
              </div>
              <h3 className="font-display text-2xl font-bold text-[#1c1917]">
                Menu Published Successfully!
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Successfully added <strong>{successStats.imported} dishes</strong> across{" "}
                <strong>{successStats.categories} categories</strong> to your live QR menu.
              </p>
              <Button
                onClick={() => {
                  onClose();
                  onImportComplete();
                }}
                className="mt-4 h-11 px-8 rounded-xl bg-[#1c1917] text-[#fdfbf7] font-bold text-xs hover:bg-[#292524] shadow-xs"
                id="button-done-menu-import"
              >
                View Updated Menu
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
