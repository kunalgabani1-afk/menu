import React, { useState } from "react";
import {
  UtensilsCrossed,
  Plus,
  Search,
  Trash2,
  Edit2,
  Upload,
  Camera,
  Check,
  Image as ImageIcon,
  FolderPlus,
  AlertTriangle,
  Sliders,
  Sparkles,
  Layers,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { uploadMenuImage, getIdToken } from "@/lib/firebase";
import { TablelineLoader } from "./TablelineLoading";
import {
  useListCategories,
  useListMenuItems,
  useCreateCategory,
  useUpdateCategory,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useDeleteCategory,
  useGetRestaurantDashboard,
  getListMenuItemsQueryKey,
  getListCategoriesQueryKey,
  getGetRestaurantDashboardQueryKey,
} from "@workspace/api-client-react";
import type { Category, MenuItem } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CanonicalModifierGroup } from "./ItemModifierModal";
import { MenuImportModal } from "./MenuImportModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { canUseFeature, getPlanLimits, normalizePlanId } from "@/lib/plans";

interface MenuManagementProps {
  slug: string;
  currency?: string;
  entitlements?: Record<string, boolean>;
  planId?: string;
  onUpgrade?: () => void;
}

export function MenuManagement({ slug, currency = "₹", planId, onUpgrade }: MenuManagementProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: categories = [], isLoading: loadingCats } = useListCategories(slug);
  const { data: menuItems = [], isLoading: loadingItems } = useListMenuItems(slug);

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();
  const deleteCategory = useDeleteCategory();

  // Tabs: Dishes vs Categories vs Modifiers
  const [activeTab, setActiveTab] = useState<"items" | "categories" | "modifiers">("items");

  // Query Modifier Groups
  const {
    data: modifierGroups = [],
    isLoading: loadingModGroups,
    refetch: refetchModGroups,
  } = useQuery<CanonicalModifierGroup[]>({
    queryKey: ["modifier-groups", slug],
    queryFn: async () => {
      const token = await getIdToken().catch(() => null);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/restaurants/${slug}/modifier-groups`, {
        headers,
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>("ALL");

  // Modifier Groups State
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [editingModGroup, setEditingModGroup] = useState<CanonicalModifierGroup | null>(null);
  const [modGroupToDelete, setModGroupToDelete] = useState<CanonicalModifierGroup | null>(null);
  const [deletingModGroup, setDeletingModGroup] = useState(false);
  const [savingModGroup, setSavingModGroup] = useState(false);

  const [modForm, setModForm] = useState<{
    name: string;
    description: string;
    selectionType: "single" | "multiple";
    required: boolean;
    minSelections: number;
    maxSelections: number;
    options: Array<{
      id: string;
      name: string;
      priceAdjustment: number;
      available: boolean;
      isDefault: boolean;
    }>;
  }>({
    name: "",
    description: "",
    selectionType: "single",
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [
      { id: "opt_1", name: "", priceAdjustment: 0, available: true, isDefault: true },
      { id: "opt_2", name: "", priceAdjustment: 0, available: true, isDefault: false },
    ],
  });

  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<string[]>([]);

  // Item Modal State (Create / Edit)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    categoryId: "",
    price: "",
    description: "",
    imageUrl: "",
    veg: true,
    isJain: false,
    available: true,
    badge: "none" as "none" | "bestseller" | "chefs_pick",
    nameGu: "",
    descGu: "",
    nameHi: "",
    descHi: "",
  });
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // Category Modal State (Create / Edit)
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catNameGu, setCatNameGu] = useState("");
  const [catNameHi, setCatNameHi] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catModifierGroupIds, setCatModifierGroupIds] = useState<string[]>([]);
  const [savingCat, setSavingCat] = useState(false);

  // Item customization overrides
  const [disabledModifierGroupIds, setDisabledModifierGroupIds] = useState<string[]>([]);
  const [showItemCustomizationOptions, setShowItemCustomizationOptions] = useState(false);

  // Large Menu Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Plan Limit Awareness
  const { data: dashboard } = useGetRestaurantDashboard(slug);
  const currentPlan = normalizePlanId((dashboard as any)?.plan || (dashboard as any)?.restaurant?.plan || planId);
  const planLimits = (dashboard as any)?.planLimits || getPlanLimits(currentPlan);
  const maxMenuItems = planLimits.maxMenuItems ?? 50;
  const isAtOrOverLimit = maxMenuItems < 999999 && menuItems.length >= maxMenuItems;
  const isOverLimit = maxMenuItems < 999999 && menuItems.length > maxMenuItems;

  // Deletion Dialog States
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListMenuItemsQueryKey(slug) });
    qc.invalidateQueries({ queryKey: getListCategoriesQueryKey(slug) });
    qc.invalidateQueries({ queryKey: getGetRestaurantDashboardQueryKey(slug) });
    qc.invalidateQueries({ queryKey: ["modifier-groups", slug] });
  };

  const handleOpenAddModifierGroup = () => {
    setEditingModGroup(null);
    setModForm({
      name: "",
      description: "",
      selectionType: "single",
      required: false,
      minSelections: 0,
      maxSelections: 1,
      options: [
        { id: `opt_${Date.now()}_1`, name: "", priceAdjustment: 0, available: true, isDefault: true },
        { id: `opt_${Date.now()}_2`, name: "", priceAdjustment: 0, available: true, isDefault: false },
      ],
    });
    setIsModModalOpen(true);
  };

  const handleOpenEditModifierGroup = (group: CanonicalModifierGroup) => {
    setEditingModGroup(group);
    setModForm({
      name: group.name,
      description: group.description || "",
      selectionType: (group.selectionType as "multiple" | "single") || "single",
      required: Boolean(group.required),
      minSelections: Number(group.minSelections ?? (group.required ? 1 : 0)),
      maxSelections: Number(group.maxSelections ?? 1),
      options: (group.options || []).map((o, idx) => ({
        id: o.id || `opt_${idx}`,
        name: o.name,
        priceAdjustment: Number(o.priceAdjustment ?? o.price ?? 0),
        available: o.available !== false,
        isDefault: Boolean(o.isDefault),
      })),
    });
    setIsModModalOpen(true);
  };

  const handleSaveModifierGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modForm.name.trim()) {
      toast({ variant: "destructive", title: "Group name is required" });
      return;
    }

    const cleanOptions = modForm.options
      .filter((o) => o.name.trim())
      .map((o, idx) => ({
        id: o.id || `opt_${idx}`,
        name: o.name.trim(),
        priceAdjustment: Math.max(0, Number(o.priceAdjustment || 0)),
        available: o.available !== false,
        isDefault: Boolean(o.isDefault),
      }));

    if (cleanOptions.length === 0) {
      toast({ variant: "destructive", title: "At least one option is required" });
      return;
    }

    setSavingModGroup(true);
    try {
      const payload = {
        name: modForm.name.trim(),
        description: modForm.description.trim(),
        selectionType: modForm.selectionType,
        required: modForm.required,
        minSelections: modForm.required ? Math.max(1, Number(modForm.minSelections || 1)) : 0,
        maxSelections: modForm.selectionType === "single" ? 1 : Math.max(1, Number(modForm.maxSelections || 1)),
        options: cleanOptions,
      };

      const token = await getIdToken().catch(() => null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const url = editingModGroup
        ? `/api/restaurants/${slug}/modifier-groups/${editingModGroup.id}`
        : `/api/restaurants/${slug}/modifier-groups`;
      const method = editingModGroup ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Failed to save modifier group");
      }

      toast({
        title: editingModGroup ? "Modifier group updated" : "Modifier group created",
      });
      setIsModModalOpen(false);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not save modifier group",
        description: err.message,
      });
    } finally {
      setSavingModGroup(false);
    }
  };

  const handleDeleteModifierGroup = async () => {
    if (!modGroupToDelete) return;
    setDeletingModGroup(true);
    try {
      const token = await getIdToken().catch(() => null);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/modifier-groups/${modGroupToDelete.id}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Failed to delete group");
      }
      toast({ title: "Modifier group deleted" });
      setModGroupToDelete(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err.message,
      });
    } finally {
      setDeletingModGroup(false);
    }
  };

  const REUSABLE_PRESETS = [
    {
      name: "Spice Level",
      icon: "🌶️",
      description: "Mild, Medium, Spicy heat choices",
      selectionType: "single" as const,
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: "Mild", priceAdjustment: 0 },
        { name: "Medium", priceAdjustment: 0 },
        { name: "Spicy", priceAdjustment: 0 },
      ],
    },
    {
      name: "Preparation",
      icon: "🥣",
      description: "Regular, Jain, No Onion-Garlic styles",
      selectionType: "single" as const,
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: "Regular", priceAdjustment: 0 },
        { name: "Jain", priceAdjustment: 0 },
        { name: "No Onion-Garlic", priceAdjustment: 0 },
      ],
    },
    {
      name: "Add-ons",
      icon: "🧀",
      description: "Extra cheese, extra dip & toppings",
      selectionType: "multiple" as const,
      required: false,
      minSelections: 0,
      maxSelections: 5,
      options: [
        { name: "Extra Cheese", priceAdjustment: 30 },
        { name: "Extra Dip", priceAdjustment: 20 },
      ],
    },
    {
      name: "Beverage Prep",
      icon: "☕",
      description: "Hot, Iced, Less Sugar, No Sugar",
      selectionType: "single" as const,
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: "Hot", priceAdjustment: 0 },
        { name: "Iced", priceAdjustment: 0 },
        { name: "Less Sugar", priceAdjustment: 0 },
        { name: "No Sugar", priceAdjustment: 0 },
      ],
    },
    {
      name: "Milk Choice",
      icon: "🥛",
      description: "Whole Milk, Oat Milk, Almond Milk, Soy Milk",
      selectionType: "single" as const,
      required: false,
      minSelections: 0,
      maxSelections: 1,
      options: [
        { name: "Whole Milk", priceAdjustment: 0 },
        { name: "Oat Milk", priceAdjustment: 30 },
        { name: "Almond Milk", priceAdjustment: 35 },
        { name: "Soy Milk", priceAdjustment: 25 },
      ],
    },
    {
      name: "Sauce Choice",
      icon: "🥫",
      description: "Tomato Sauce, Mint Sauce, Cheese Sauce",
      selectionType: "single" as const,
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: "Tomato Sauce", priceAdjustment: 0 },
        { name: "Mint Sauce", priceAdjustment: 10 },
        { name: "Cheese Sauce", priceAdjustment: 20 },
      ],
    },
  ];

  const handleApplyPreset = async (preset: {
    name: string;
    description: string;
    selectionType: "single" | "multiple";
    required: boolean;
    minSelections: number;
    maxSelections: number;
    options: Array<{ name: string; priceAdjustment: number }>;
  }): Promise<string | null> => {
    try {
      const existing = modifierGroups.find((g) => g.name.toLowerCase() === preset.name.toLowerCase());
      if (existing) {
        return existing.id;
      }

      const payload = {
        name: preset.name,
        description: preset.description,
        selectionType: preset.selectionType,
        required: preset.required,
        minSelections: preset.minSelections,
        maxSelections: preset.maxSelections,
        options: preset.options.map((o, idx) => ({
          id: `opt_${Date.now()}_${idx}`,
          name: o.name,
          priceAdjustment: o.priceAdjustment,
          available: true,
          isDefault: idx === 0 && preset.selectionType === "single",
        })),
      };

      const token = await getIdToken().catch(() => null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/modifier-groups`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to add preset");
      }

      const data = await res.json();
      toast({ title: `Added "${preset.name}" preset group` });
      refetchModGroups();
      refresh();
      return data.id || null;
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to apply preset", description: err.message });
      return null;
    }
  };

  // Open Item Modal
  const handleOpenAddItem = () => {
    if (isAtOrOverLimit) {
      const planName = currentPlan === "starter" ? "Starter" : currentPlan === "growth" ? "Growth" : "Pro";
      toast({
        variant: "destructive",
        title: `${planName} Plan Limit Reached`,
        description: `Your ${planName} plan allows up to ${maxMenuItems} menu items. You currently have ${menuItems.length}. Delete unused dishes or upgrade to add more.`,
      });
      return;
    }
    setEditingItem(null);
    setSelectedModifierGroupIds([]);
    setDisabledModifierGroupIds([]);
    setShowItemCustomizationOptions(false);
    setItemForm({
      name: "",
      categoryId: categories[0]?.id || "",
      price: "",
      description: "",
      imageUrl: "",
      veg: true,
      isJain: false,
      available: true,
      badge: "none",
      nameGu: "",
      descGu: "",
      nameHi: "",
      descHi: "",
    });
    setItemFile(null);
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (item: MenuItem) => {
    const anyItem = item as any;
    setEditingItem(item);
    const itemGroupIds = Array.isArray(anyItem.modifierGroupIds) ? anyItem.modifierGroupIds : [];
    const disabledIds = Array.isArray(anyItem.disabledModifierGroupIds) ? anyItem.disabledModifierGroupIds : [];
    setSelectedModifierGroupIds(itemGroupIds);
    setDisabledModifierGroupIds(disabledIds);
    setShowItemCustomizationOptions(itemGroupIds.length > 0 || disabledIds.length > 0);
    setItemForm({
      name: item.name,
      categoryId: item.categoryId || categories[0]?.id || "",
      price: String(item.price),
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      veg: item.veg ?? true,
      isJain: Boolean(anyItem.isJain),
      available: item.available ?? true,
      badge: anyItem.badge || (anyItem.isBestseller ? "bestseller" : anyItem.isChefsPick ? "chefs_pick" : "none"),
      nameGu: anyItem.translations?.gu?.name || "",
      descGu: anyItem.translations?.gu?.description || "",
      nameHi: anyItem.translations?.hi?.name || "",
      descHi: anyItem.translations?.hi?.description || "",
    });
    setItemFile(null);
    setIsItemModalOpen(true);
  };

  // Save Item (Create or Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name.trim()) {
      toast({ variant: "destructive", title: "Please fill in item name" });
      return;
    }
    const numericPrice = Number(itemForm.price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      toast({ variant: "destructive", title: "Please enter a valid price" });
      return;
    }

    setSavingItem(true);
    try {
      let finalImageUrl = itemForm.imageUrl;
      if (itemFile) {
        finalImageUrl = await uploadMenuImage(
          itemFile,
          slug,
          editingItem?.id || `item_${Date.now()}`
        );
      }

      // Build translations object
      const translations: Record<string, any> = {};
      if (itemForm.nameGu.trim() || itemForm.descGu.trim()) {
        translations.gu = {
          name: itemForm.nameGu.trim() || itemForm.name.trim(),
          description: itemForm.descGu.trim() || itemForm.description.trim(),
        };
      }
      if (itemForm.nameHi.trim() || itemForm.descHi.trim()) {
        translations.hi = {
          name: itemForm.nameHi.trim() || itemForm.name.trim(),
          description: itemForm.descHi.trim() || itemForm.description.trim(),
        };
      }

      const selectedCategory = itemForm.categoryId?.trim() || categories[0]?.id;

      const itemPayload: any = {
        name: itemForm.name.trim(),
        price: numericPrice,
        description: itemForm.description.trim(),
        imageUrl: finalImageUrl || null,
        veg: Boolean(itemForm.veg),
        isJain: Boolean(itemForm.isJain),
        available: itemForm.available ?? true,
        availabilityType: itemForm.available ? "ALWAYS" : "OUT_OF_STOCK",
        badge: itemForm.badge === "none" ? null : itemForm.badge,
        isBestseller: itemForm.badge === "bestseller",
        isChefsPick: itemForm.badge === "chefs_pick",
        translations: Object.keys(translations).length > 0 ? translations : null,
        modifierGroupIds: selectedModifierGroupIds,
        disabledModifierGroupIds: disabledModifierGroupIds,
      };

      if (selectedCategory) {
        itemPayload.categoryId = selectedCategory;
      }

      if (editingItem) {
        await updateItem.mutateAsync({
          restaurantSlug: slug,
          itemId: editingItem.id,
          data: itemPayload,
        });
        toast({ title: "Dish updated" });
      } else {
        await createItem.mutateAsync({
          restaurantSlug: slug,
          data: {
            ...itemPayload,
            popular: false,
            displayOrder: Math.floor(menuItems.length),
          },
        });
        toast({ title: "Dish added to menu" });
      }

      setIsItemModalOpen(false);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not save dish",
        description: err.message || "Please check inputs.",
      });
    } finally {
      setSavingItem(false);
    }
  };

  // 1-Tap Sold Out Toggle (instant Available / Unavailable)
  const handleToggleStock = async (item: MenuItem) => {
    const newAvailable = !item.available;
    try {
      await updateItem.mutateAsync({
        restaurantSlug: slug,
        itemId: item.id,
        data: {
          available: newAvailable,
          availabilityType: newAvailable ? "ALWAYS" : "OUT_OF_STOCK",
        } as any,
      });
      toast({
        title: newAvailable ? `"${item.name}" marked as Available` : `"${item.name}" marked as Sold Out`,
        description: newAvailable ? "Customers can now order this dish." : "Customers will see this dish marked Sold Out.",
      });
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to update availability" });
    }
  };

  // 1-Tap Quick Badge Cycle
  const handleQuickCycleBadge = async (item: MenuItem) => {
    const anyItem = item as any;
    const currentBadge = anyItem.badge || (anyItem.isBestseller ? "bestseller" : anyItem.isChefsPick ? "chefs_pick" : "none");
    const nextBadge = currentBadge === "none" ? "bestseller" : currentBadge === "bestseller" ? "chefs_pick" : "none";

    try {
      await updateItem.mutateAsync({
        restaurantSlug: slug,
        itemId: item.id,
        data: {
          badge: nextBadge === "none" ? null : nextBadge,
          isBestseller: nextBadge === "bestseller",
          isChefsPick: nextBadge === "chefs_pick",
        } as any,
      });
      toast({
        title: nextBadge === "bestseller" ? "Marked as 🔥 Bestseller" : nextBadge === "chefs_pick" ? "Marked as ⭐ Chef's Pick" : "Badge removed",
      });
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to update badge" });
    }
  };

  // Delete Item
  const handleDeleteItem = (item: MenuItem) => {
    setItemToDelete(item);
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    setDeletingItem(true);
    try {
      await deleteItem.mutateAsync({
        restaurantSlug: slug,
        itemId: itemToDelete.id,
      });
      toast({
        title: "Dish removed",
        description: `"${itemToDelete.name}" has been removed. Past orders remain unchanged.`,
      });
      setItemToDelete(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not delete dish",
        description: err?.message || "Failed to remove item. Please try again.",
      });
    } finally {
      setDeletingItem(false);
    }
  };

  const handleOpenAddCategory = () => {
    setEditingCat(null);
    setCatName("");
    setCatNameGu("");
    setCatNameHi("");
    setCatDesc("");
    setCatModifierGroupIds([]);
    setIsCatModalOpen(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCat(cat);
    const anyCat = cat as any;
    setCatName(cat.name);
    setCatNameGu(anyCat.translations?.gu?.name || "");
    setCatNameHi(anyCat.translations?.hi?.name || "");
    setCatDesc(cat.description || "");
    setCatModifierGroupIds(Array.isArray(anyCat.modifierGroupIds) ? anyCat.modifierGroupIds : []);
    setIsCatModalOpen(true);
  };

  // Save Category (Create or Edit)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      toast({ variant: "destructive", title: "Please enter category name" });
      return;
    }

    setSavingCat(true);
    try {
      const catTranslations: Record<string, any> = {};
      if (catNameGu.trim()) {
        catTranslations.gu = { name: catNameGu.trim() };
      }
      if (catNameHi.trim()) {
        catTranslations.hi = { name: catNameHi.trim() };
      }

      const categoryData = {
        name: catName.trim(),
        description: catDesc.trim(),
        active: true,
        translations: Object.keys(catTranslations).length > 0 ? catTranslations : undefined,
        modifierGroupIds: catModifierGroupIds,
      };

      if (editingCat) {
        await updateCategory.mutateAsync({
          restaurantSlug: slug,
          categoryId: editingCat.id,
          data: categoryData as any,
        });
        toast({ title: "Category updated" });
      } else {
        await createCategory.mutateAsync({
          restaurantSlug: slug,
          data: {
            ...categoryData,
            displayOrder: categories.length,
            imageUrl: null,
          } as any,
        });
        toast({ title: "Category added" });
      }

      setIsCatModalOpen(false);
      refresh();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save category", description: err?.message });
    } finally {
      setSavingCat(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = (cat: Category) => {
    setCatToDelete(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!catToDelete) return;
    setDeletingCat(true);
    try {
      await deleteCategory.mutateAsync({
        restaurantSlug: slug,
        categoryId: catToDelete.id,
      });
      toast({
        title: "Category deleted",
        description: `"${catToDelete.name}" removed. Dishes in this category are now uncategorized.`,
      });
      setCatToDelete(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not delete category",
        description: err?.message || "Failed to remove category. Please try again.",
      });
    } finally {
      setDeletingCat(false);
    }
  };

  // Filtered dishes
  const filteredItems = menuItems.filter((item) => {
    if (selectedCatFilter !== "ALL" && item.categoryId !== selectedCatFilter) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6" id="menu-management">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-5" id="menu-header">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Menu
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage dishes, categories, and real-time stock availability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            className="rounded-xl text-xs font-semibold gap-1.5 border-border shadow-2xs hover:bg-secondary bg-white"
            id="button-import-menu"
          >
            <Camera className="h-4 w-4 text-amber-800" />
            Snap to Menu
            <span className="ml-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold">
              AI
            </span>
          </Button>

          {activeTab === "items" ? (
            <Button
              onClick={handleOpenAddItem}
              size="sm"
              className="rounded-xl font-semibold gap-1.5"
              id="button-add-food"
            >
              <Plus className="h-4 w-4" />
              Add Food
            </Button>
          ) : activeTab === "categories" ? (
            <Button
              onClick={() => setIsCatModalOpen(true)}
              size="sm"
              className="rounded-xl font-semibold gap-1.5"
              id="button-add-category"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </Button>
          ) : (
            <Button
              onClick={handleOpenAddModifierGroup}
              size="sm"
              className="rounded-xl font-semibold gap-1.5"
              id="button-add-modifier-group"
            >
              <Plus className="h-4 w-4" />
              Add Modifier Group
            </Button>
          )}
        </div>
      </div>

      {/* Plan Limit Notice Banner */}
      {isAtOrOverLimit && (
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 text-xs ${
            isOverLimit
              ? "border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/60"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
          id="menu-plan-limit-banner"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold text-sm">
              <span className="capitalize">{currentPlan}</span> Plan Limit {isOverLimit ? "Exceeded" : "Reached"}
            </p>
            <p className="opacity-90 leading-relaxed">
              Your restaurant is on the <strong className="capitalize">{currentPlan}</strong> plan (limit: {maxMenuItems} menu items).
              You currently have <strong>{menuItems.length} items</strong>. Existing items remain live and active on customer menus. To add more items, please remove unused dishes or upgrade your plan.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3" id="menu-tabs-bar">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("items")}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "items"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            id="tab-menu-dishes"
          >
            Dishes ({menuItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("categories")}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "categories"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            id="tab-menu-categories"
          >
            Categories ({categories.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("modifiers")}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "modifiers"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            id="tab-menu-modifiers"
          >
            Customizations ({modifierGroups.length})
          </button>
        </div>

        {/* Filters for dishes */}
        {activeTab === "items" && (
          <div className="flex items-center gap-2">
            <select
              value={selectedCatFilter}
              onChange={(e) => setSelectedCatFilter(e.target.value)}
              className="h-8 rounded-xl border border-border bg-card px-2.5 text-xs text-foreground outline-none"
              id="select-category-filter"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="relative w-40 sm:w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search food..."
                className="h-8 rounded-xl pl-7 text-xs bg-card"
                id="input-search-food"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content: Dishes Tab */}
      {activeTab === "items" && (
        <div>
          {loadingItems ? (
            <TablelineLoader
              variant="card"
              message="Loading menu dishes…"
              subtext="Cataloging ingredients, dietary badges and pricing…"
            />
          ) : filteredItems.length === 0 ? (
            <div
              className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-card/60 p-8 text-center"
              id="empty-dishes"
            >
              <UtensilsCrossed className="h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 font-display text-base font-semibold text-foreground">
                No food items found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {menuItems.length === 0
                  ? "Start by adding your first dish to the menu."
                  : "No dishes match your filter criteria."}
              </p>
              {menuItems.length === 0 && (
                <Button
                  onClick={handleOpenAddItem}
                  size="sm"
                  className="mt-4 rounded-xl font-semibold"
                  id="button-empty-add-food"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Food Item
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3" id="dishes-list">
              {filteredItems.map((item) => {
                const cat = categories.find((c) => c.id === item.categoryId);
                const isAvailable = item.available ?? true;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3.5 shadow-2xs hover:border-border/80 transition-colors"
                    id={`row-dish-${item.id}`}
                  >
                    {/* Thumbnail */}
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground">
                          <UtensilsCrossed className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    {/* Dish Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Veg / Non-veg indicator */}
                        <span
                          className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border ${
                            item.veg
                              ? "border-[#418157] bg-white"
                              : "border-[#8a241b] bg-white"
                          }`}
                          title={item.veg ? "Vegetarian" : "Non-vegetarian"}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.veg ? "bg-[#418157]" : "bg-[#8a241b]"
                            }`}
                          />
                        </span>

                        {/* Jain indicator */}
                        {(item as any).isJain && (
                          <span className="rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 text-[10px] font-bold">
                            Jain
                          </span>
                        )}

                        {/* Bestseller Badge */}
                        {((item as any).badge === "bestseller" || (item as any).isBestseller) && (
                          <span className="rounded-md bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 text-[10px] font-semibold">
                            🔥 Bestseller
                          </span>
                        )}

                        {/* Chef's Pick Badge */}
                        {((item as any).badge === "chefs_pick" || (item as any).isChefsPick) && (
                          <span className="rounded-md bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.2 text-[10px] font-semibold">
                            ⭐ Chef's Pick
                          </span>
                        )}

                        <h3 className="truncate font-semibold text-sm text-foreground">
                          {item.name}
                        </h3>
                        {cat && (
                          <span className="rounded-md bg-secondary px-2 py-0.2 text-[10px] font-medium text-muted-foreground">
                            {cat.name}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      {Array.isArray((item as any).modifierGroupIds) && (item as any).modifierGroupIds.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Sliders className="h-2.5 w-2.5" />
                          </span>
                          {(item as any).modifierGroupIds.map((gid: string) => {
                            const grp = modifierGroups.find((g) => g.id === gid);
                            return (
                              <span
                                key={gid}
                                className="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.2 text-[9px] font-semibold text-primary"
                              >
                                {grp?.name || gid}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <p className="mt-1 font-mono text-xs font-bold text-foreground">
                        {currency}
                        {Number(item.price).toFixed(0)}
                      </p>
                    </div>

                    {/* Actions: 1-Tap Sold Out Toggle, Quick Badge, Edit/Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 1-Tap Sold Out Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleStock(item)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all shadow-2xs ${
                          isAvailable
                            ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300/60"
                            : "bg-red-100 text-red-900 hover:bg-red-200 border border-red-300/60"
                        }`}
                        id={`button-toggle-stock-${item.id}`}
                        title={isAvailable ? "Click to mark as Sold Out" : "Click to mark as Available"}
                      >
                        <span className={`h-2 w-2 rounded-full ${isAvailable ? "bg-emerald-600" : "bg-red-600"}`} />
                        {isAvailable ? "Available" : "Sold Out"}
                      </button>

                      {/* 1-Tap Quick Badge Cycle */}
                      <button
                        type="button"
                        onClick={() => handleQuickCycleBadge(item)}
                        className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                          (item as any).badge === "bestseller" || (item as any).isBestseller
                            ? "bg-amber-100 text-amber-900 border border-amber-300/80"
                            : (item as any).badge === "chefs_pick" || (item as any).isChefsPick
                            ? "bg-purple-100 text-purple-900 border border-purple-300/80"
                            : "border border-border/70 text-muted-foreground hover:bg-secondary"
                        }`}
                        title="1-Tap to toggle Bestseller / Chef's Pick badge"
                        id={`button-badge-${item.id}`}
                      >
                        {(item as any).badge === "bestseller" || (item as any).isBestseller
                          ? "🔥 Bestseller"
                          : (item as any).badge === "chefs_pick" || (item as any).isChefsPick
                          ? "⭐ Chef's Pick"
                          : "+ Badge"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditItem(item)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        id={`button-edit-dish-${item.id}`}
                        title="Edit dish"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        id={`button-delete-dish-${item.id}`}
                        title="Delete dish"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Content: Categories Tab */}
      {activeTab === "categories" && (
        <div>
          {loadingCats ? (
            <TablelineLoader
              variant="card"
              message="Loading menu categories…"
              size="sm"
            />
          ) : categories.length === 0 ? (
            <div
              className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-card/60 p-8 text-center"
              id="empty-categories"
            >
              <FolderPlus className="h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 font-display text-base font-semibold text-foreground">
                No categories yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create sections like Starters, Mains, Beverages, or Desserts.
              </p>
              <Button
                onClick={handleOpenAddCategory}
                size="sm"
                className="mt-4 rounded-xl font-semibold"
                id="button-empty-add-cat"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Category
              </Button>
            </div>
          ) : (
            <div className="space-y-3" id="categories-list">
              {categories.map((cat, idx) => {
                const count = menuItems.filter((i) => i.categoryId === cat.id).length;
                const anyCat = cat as any;
                const catGroupIds: string[] = Array.isArray(anyCat.modifierGroupIds) ? anyCat.modifierGroupIds : [];

                return (
                  <div
                    key={cat.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs"
                    id={`row-category-${cat.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-muted-foreground mt-0.5">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">
                          {cat.name}
                        </h3>
                        {cat.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {cat.description}
                          </p>
                        )}
                        {catGroupIds.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                              <span>⚡ Inherited Options:</span>
                            </span>
                            {catGroupIds.map((gid) => {
                              const grp = modifierGroups.find((g) => g.id === gid);
                              return (
                                <span
                                  key={gid}
                                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary"
                                >
                                  {grp?.name || gid} ✓
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <span className="font-mono text-xs text-muted-foreground">
                        {count} {count === 1 ? "dish" : "dishes"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCategory(cat)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          id={`button-edit-category-${cat.id}`}
                          title="Edit Category & Inherited Options"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          id={`button-delete-category-${cat.id}`}
                          title="Delete Category"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Modifiers & Customization Groups */}
      {activeTab === "modifiers" && (
        <div className="space-y-6" id="modifiers-tab-content">
          {/* Quick Presets Bar */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                Quick Customization Templates (1-Click Presets)
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Add standard restaurant customizations with one click, then attach them to whole categories or individual dishes.
            </p>
            <div className="flex flex-wrap gap-2">
              {REUSABLE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary hover:border-primary/40 transition-colors shadow-2xs"
                >
                  <span>{preset.icon}</span> {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Modifier Groups List */}
          {modifierGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
              <Sliders className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="font-semibold text-sm text-foreground">No Customization Groups Yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Create reusable modifier groups like Spice Level, Preparation, Milk Choice, or Add-ons.
              </p>
              <Button
                onClick={handleOpenAddModifierGroup}
                size="sm"
                className="mt-4 rounded-xl font-semibold"
                id="button-empty-add-modifier-group"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create First Modifier Group
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="modifier-groups-grid">
              {modifierGroups.map((group) => {
                const linkedItemsCount = menuItems.filter(
                  (i) => Array.isArray((i as any).modifierGroupIds) && (i as any).modifierGroupIds.includes(group.id)
                ).length;
                const inheritedCategoriesCount = categories.filter(
                  (c) => Array.isArray((c as any).modifierGroupIds) && (c as any).modifierGroupIds.includes(group.id)
                ).length;

                return (
                  <div
                    key={group.id}
                    className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs"
                    id={`card-modifier-group-${group.id}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm text-foreground">
                              {group.name}
                            </h3>
                            {group.required ? (
                              <span className="rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-bold">
                                Required
                              </span>
                            ) : (
                              <span className="rounded-md bg-secondary text-muted-foreground px-1.5 py-0.2 text-[10px] font-medium">
                                Optional
                              </span>
                            )}
                            <span className="rounded-md bg-secondary text-muted-foreground px-1.5 py-0.2 text-[10px] font-mono">
                              {group.selectionType === "single" ? "Single Choice" : "Multi-Select"}
                            </span>
                          </div>
                          {group.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {group.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModifierGroup(group)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                            id={`button-edit-modifier-group-${group.id}`}
                            title="Edit Group"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setModGroupToDelete(group)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            id={`button-delete-modifier-group-${group.id}`}
                            title="Delete Group"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Options Pill List */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(group.options || []).map((opt) => (
                          <span
                            key={opt.id}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] ${
                              opt.available === false
                                ? "border-dashed border-border text-muted-foreground/50 line-through"
                                : "border-border/80 bg-background text-foreground"
                            }`}
                          >
                            <span>{opt.name}</span>
                            {Number(opt.priceAdjustment || opt.price || 0) > 0 && (
                              <span className="font-mono font-bold text-primary text-[10px]">
                                +{currency}{Number(opt.priceAdjustment || opt.price || 0).toFixed(0)}
                              </span>
                            )}
                            {opt.isDefault && (
                              <span className="text-[9px] text-muted-foreground">(Default)</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span>
                          Direct: <strong className="text-foreground">{linkedItemsCount}</strong> {linkedItemsCount === 1 ? "dish" : "dishes"}
                        </span>
                        {inheritedCategoriesCount > 0 && (
                          <span>
                            Category: <strong className="text-primary font-semibold">{inheritedCategoriesCount}</strong> {inheritedCategoriesCount === 1 ? "category" : "categories"}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px]">
                        {group.options?.length || 0} options
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Food Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={handleSaveItem}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            id="form-save-food"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-card shrink-0">
              <h2 className="font-display text-lg font-bold text-foreground">
                {editingItem ? "Edit Dish" : "Add Food"}
              </h2>
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[calc(90vh-130px)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Dish Name *</label>
                  <Input
                    required
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder="e.g. Margherita Pizza"
                    className="mt-1 text-xs rounded-xl"
                    id="input-dish-name"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs font-semibold text-foreground">Category *</label>
                  <select
                    required
                    value={itemForm.categoryId}
                    onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
                    id="select-dish-category"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price */}
                <div>
                  <label className="text-xs font-semibold text-foreground">Price ({currency}) *</label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    placeholder="e.g. 350"
                    className="mt-1 text-xs rounded-xl"
                    id="input-dish-price"
                  />
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Description (Optional)</label>
                  <Textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    placeholder="Fresh basil, san marzano tomatoes, fresh mozzarella"
                    className="mt-1 text-xs rounded-xl h-20 resize-none"
                    id="input-dish-description"
                  />
                </div>

                {/* Photo Upload */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Photo (Optional)</label>
                  <div className="mt-1 flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setItemFile(e.target.files?.[0] || null)}
                      className="text-xs rounded-xl file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-secondary file:text-foreground"
                      id="input-dish-photo"
                    />
                    {itemForm.imageUrl && !itemFile && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-xs">
                        Existing photo saved
                      </span>
                    )}
                  </div>
                </div>

                {/* Dietary & Stock Settings */}
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
                  {/* Veg / Non-veg */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="checkbox-is-veg"
                      checked={itemForm.veg}
                      onChange={(e) => setItemForm({ ...itemForm, veg: e.target.checked })}
                      className="h-4 w-4 rounded border-border"
                    />
                    <label htmlFor="checkbox-is-veg" className="text-xs font-semibold cursor-pointer">
                      Vegetarian Dish
                    </label>
                  </div>

                  {/* Jain Preparation */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="checkbox-is-jain"
                      checked={itemForm.isJain}
                      onChange={(e) => setItemForm({ ...itemForm, isJain: e.target.checked })}
                      className="h-4 w-4 rounded border-border"
                    />
                    <label htmlFor="checkbox-is-jain" className="text-xs font-semibold cursor-pointer text-amber-800 dark:text-amber-300">
                      Jain Preparation
                    </label>
                  </div>

                  {/* In Stock */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="checkbox-in-stock"
                      checked={itemForm.available}
                      onChange={(e) => setItemForm({ ...itemForm, available: e.target.checked })}
                      className="h-4 w-4 rounded border-border"
                    />
                    <label htmlFor="checkbox-in-stock" className="text-xs font-semibold cursor-pointer">
                      Available in Stock
                    </label>
                  </div>
                </div>

                {/* Special Badge (Bestseller / Chef's Pick) */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Dish Badge (Promotional Highlight)</label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, badge: "none" })}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                        itemForm.badge === "none"
                          ? "bg-secondary font-semibold text-foreground border border-border"
                          : "border border-border/60 text-muted-foreground hover:bg-secondary/50"
                      }`}
                    >
                      No Badge
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, badge: "bestseller" })}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                        itemForm.badge === "bestseller"
                          ? "bg-amber-100 text-amber-900 border border-amber-300 font-semibold"
                          : "border border-border/60 text-muted-foreground hover:bg-amber-50"
                      }`}
                    >
                      🔥 Bestseller
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, badge: "chefs_pick" })}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                        itemForm.badge === "chefs_pick"
                          ? "bg-purple-100 text-purple-900 border border-purple-300 font-semibold"
                          : "border border-border/60 text-muted-foreground hover:bg-purple-50"
                      }`}
                    >
                      ⭐ Chef's Pick
                    </button>
                  </div>
                </div>

                {/* Regional Translations (Gujarati & Hindi) */}
                <div className="sm:col-span-2 rounded-xl border border-border/70 bg-secondary/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      Regional Translations (Gujarati &amp; Hindi)
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Shows when customer switches language
                    </span>
                  </div>

                  {/* Gujarati */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Name (ગુજરાતી)</label>
                      <Input
                        value={itemForm.nameGu}
                        onChange={(e) => setItemForm({ ...itemForm, nameGu: e.target.value })}
                        placeholder="e.g. માર્ગરીટા પીત્ઝા"
                        className="mt-1 text-xs rounded-xl h-8"
                        id="input-dish-name-gu"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Description (ગુજરાતી)</label>
                      <Input
                        value={itemForm.descGu}
                        onChange={(e) => setItemForm({ ...itemForm, descGu: e.target.value })}
                        placeholder="વિગતો..."
                        className="mt-1 text-xs rounded-xl h-8"
                        id="input-dish-desc-gu"
                      />
                    </div>
                  </div>

                  {/* Hindi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Name (हिंदी)</label>
                      <Input
                        value={itemForm.nameHi}
                        onChange={(e) => setItemForm({ ...itemForm, nameHi: e.target.value })}
                        placeholder="e.g. मार्गेरिटा पिज़्ज़ा"
                        className="mt-1 text-xs rounded-xl h-8"
                        id="input-dish-name-hi"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Description (हिंदी)</label>
                      <Input
                        value={itemForm.descHi}
                        onChange={(e) => setItemForm({ ...itemForm, descHi: e.target.value })}
                        placeholder="विवरण..."
                        className="mt-1 text-xs rounded-xl h-8"
                        id="input-dish-desc-hi"
                      />
                    </div>
                  </div>
                </div>

                {/* Customizations & Modifier Groups Linking */}
                {(() => {
                  const itemCat = categories.find((c) => c.id === itemForm.categoryId);
                  const catInheritedGroupIds: string[] = Array.isArray((itemCat as any)?.modifierGroupIds)
                    ? (itemCat as any).modifierGroupIds
                    : [];

                  return (
                    <div className="sm:col-span-2 rounded-2xl border border-border/70 bg-card p-3.5 space-y-3" id="section-item-modifiers">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sliders className="h-4 w-4 text-primary" />
                          <div>
                            <label className="text-xs font-bold text-foreground">
                              Customizations &amp; Options
                            </label>
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              (Plain item by default)
                            </span>
                          </div>
                        </div>
                        {!showItemCustomizationOptions && (
                          <button
                            type="button"
                            onClick={() => setShowItemCustomizationOptions(true)}
                            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                            id="button-show-add-options"
                          >
                            <Plus className="h-3 w-3" /> Add Options
                          </button>
                        )}
                      </div>

                      {/* Inherited Category Modifiers Section */}
                      {catInheritedGroupIds.length > 0 && (
                        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <span>⚡ Inherited from category "{itemCat?.name}":</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Category level
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {catInheritedGroupIds.map((gid) => {
                              const grp = modifierGroups.find((g) => g.id === gid);
                              const isDisabled = disabledModifierGroupIds.includes(gid);
                              return (
                                <div
                                  key={gid}
                                  className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                                    isDisabled
                                      ? "border-border/60 bg-muted/30 text-muted-foreground"
                                      : "border-primary/30 bg-background text-foreground"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <span className={`font-semibold ${isDisabled ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                      {grp?.name || gid}
                                    </span>
                                    {grp?.options && (
                                      <p className="text-[10px] text-muted-foreground truncate">
                                        {grp.options.map((o) => o.name).join(", ")}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isDisabled) {
                                        setDisabledModifierGroupIds(disabledModifierGroupIds.filter((id) => id !== gid));
                                      } else {
                                        setDisabledModifierGroupIds([...disabledModifierGroupIds, gid]);
                                      }
                                    }}
                                    className={`ml-2 shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                      isDisabled
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                    }`}
                                  >
                                    {isDisabled ? "Enable for this dish" : "Disable for this dish"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 1-Click Quick Presets Bar */}
                      {showItemCustomizationOptions && (
                        <div className="space-y-2 pt-1 border-t border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                              1-Click Reusable Presets
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Tap to attach
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {REUSABLE_PRESETS.map((preset) => {
                              const existing = modifierGroups.find((g) => g.name.toLowerCase() === preset.name.toLowerCase());
                              const isAttached = existing && selectedModifierGroupIds.includes(existing.id);

                              return (
                                <button
                                  key={preset.name}
                                  type="button"
                                  onClick={async () => {
                                    let targetId = existing?.id;
                                    if (!targetId) {
                                      targetId = (await handleApplyPreset(preset)) || undefined;
                                    }
                                    if (targetId) {
                                      if (selectedModifierGroupIds.includes(targetId)) {
                                        setSelectedModifierGroupIds(selectedModifierGroupIds.filter((id) => id !== targetId));
                                      } else {
                                        setSelectedModifierGroupIds([...selectedModifierGroupIds, targetId]);
                                      }
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium border transition-all ${
                                    isAttached
                                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-2xs"
                                      : "border-border bg-secondary/50 hover:bg-secondary text-foreground"
                                  }`}
                                >
                                  <span>{preset.icon}</span> {preset.name} {isAttached ? "✓" : "+"}
                                </button>
                              );
                            })}
                          </div>

                          {/* All Library Custom Groups Checkbox List */}
                          {modifierGroups.length > 0 && (
                            <div className="mt-3 pt-2">
                              <span className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">
                                Or select from your custom groups:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                {modifierGroups.map((group) => {
                                  const isChecked = selectedModifierGroupIds.includes(group.id);
                                  return (
                                    <label
                                      key={group.id}
                                      className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer text-xs ${
                                        isChecked
                                          ? "border-primary bg-primary/5 text-foreground shadow-2xs"
                                          : "border-border/70 hover:bg-secondary/40 text-muted-foreground"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedModifierGroupIds([...selectedModifierGroupIds, group.id]);
                                          } else {
                                            setSelectedModifierGroupIds(
                                              selectedModifierGroupIds.filter((id) => id !== group.id)
                                            );
                                          }
                                        }}
                                        className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-semibold text-foreground truncate">
                                            {group.name}
                                          </span>
                                          {group.required ? (
                                            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                                              *Req
                                            </span>
                                          ) : (
                                            <span className="text-[9px] text-muted-foreground shrink-0">
                                              Opt
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                          {group.options?.map((o) => o.name).join(", ") || "No options"}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-3.5 bg-card shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsItemModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingItem}
                className="rounded-xl text-xs font-semibold"
                id="button-submit-dish"
              >
                {savingItem ? "Saving…" : editingItem ? "Update Dish" : "Save Dish"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={handleSaveCategory}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            id="form-save-category"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-card shrink-0">
              <h2 className="font-display text-lg font-bold text-foreground">
                {editingCat ? "Edit Category" : "Add Category"}
              </h2>
              <button
                type="button"
                onClick={() => setIsCatModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[calc(90vh-130px)]">
              <div>
                <label className="text-xs font-semibold text-foreground">Category Name *</label>
                <Input
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Coffee & Tea, Starters, Mains"
                  className="mt-1 text-xs rounded-xl"
                  id="input-cat-name"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">Name (ગુજરાતી)</label>
                  <Input
                    value={catNameGu}
                    onChange={(e) => setCatNameGu(e.target.value)}
                    placeholder="e.g. કોફી અને ચા"
                    className="mt-1 text-xs rounded-xl"
                    id="input-cat-name-gu"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">Name (हिंदी)</label>
                  <Input
                    value={catNameHi}
                    onChange={(e) => setCatNameHi(e.target.value)}
                    placeholder="e.g. कॉफी और चाय"
                    className="mt-1 text-xs rounded-xl"
                    id="input-cat-name-hi"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Description (Optional)</label>
                <Input
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="e.g. Served hot or iced"
                  className="mt-1 text-xs rounded-xl"
                  id="input-cat-desc"
                />
              </div>

              {/* Category-Level Inherited Modifiers */}
              <div className="rounded-2xl border border-border/70 bg-card p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    <label className="text-xs font-bold text-foreground">
                      Inherited Category Modifiers
                    </label>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {catModifierGroupIds.length} attached
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Dishes in this category will automatically inherit these modifier groups without having to configure them one-by-one (e.g. Milk Choice for all coffee items).
                </p>

                {/* 1-Click Presets for Category */}
                <div className="flex flex-wrap gap-1.5">
                  {REUSABLE_PRESETS.map((preset) => {
                    const existing = modifierGroups.find((g) => g.name.toLowerCase() === preset.name.toLowerCase());
                    const isAttached = existing && catModifierGroupIds.includes(existing.id);

                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={async () => {
                          let targetId = existing?.id;
                          if (!targetId) {
                            targetId = (await handleApplyPreset(preset)) || undefined;
                          }
                          if (targetId) {
                            if (catModifierGroupIds.includes(targetId)) {
                              setCatModifierGroupIds(catModifierGroupIds.filter((id) => id !== targetId));
                            } else {
                              setCatModifierGroupIds([...catModifierGroupIds, targetId]);
                            }
                          }
                        }}
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium border transition-all ${
                          isAttached
                            ? "border-primary bg-primary text-primary-foreground font-semibold shadow-2xs"
                            : "border-border bg-secondary/50 hover:bg-secondary text-foreground"
                        }`}
                      >
                        <span>{preset.icon}</span> {preset.name} {isAttached ? "✓" : "+"}
                      </button>
                    );
                  })}
                </div>

                {/* Modifier Groups Checkbox List */}
                {modifierGroups.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 pt-1">
                    {modifierGroups.map((group) => {
                      const isChecked = catModifierGroupIds.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer text-xs ${
                            isChecked
                              ? "border-primary bg-primary/5 text-foreground shadow-2xs"
                              : "border-border/70 hover:bg-secondary/40 text-muted-foreground"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCatModifierGroupIds([...catModifierGroupIds, group.id]);
                              } else {
                                setCatModifierGroupIds(catModifierGroupIds.filter((id) => id !== group.id));
                              }
                            }}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-foreground truncate">
                                {group.name}
                              </span>
                              {group.required ? (
                                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                                  *Req
                                </span>
                              ) : (
                                <span className="text-[9px] text-muted-foreground shrink-0">
                                  Opt
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                              {group.options?.map((o) => o.name).join(", ") || "No options"}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-3.5 bg-card shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCatModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingCat}
                className="rounded-xl text-xs font-semibold"
                id="button-submit-category"
              >
                {savingCat ? "Saving…" : editingCat ? "Update Category" : "Add Category"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Dish Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingItem) setItemToDelete(null);
        }}
        title={`Delete ${itemToDelete?.name || "this dish"}?`}
        description="This removes the item from your menu. Past orders will remain unchanged."
        confirmLabel="Delete Item"
        isDestructive={true}
        isLoading={deletingItem}
        onConfirm={handleConfirmDeleteItem}
      />

      {/* Category Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(catToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingCat) setCatToDelete(null);
        }}
        title={`Delete "${catToDelete?.name || "this category"}"?`}
        description="Dishes in this category will become uncategorized. Past orders will remain unchanged."
        confirmLabel="Delete Category"
        isDestructive={true}
        isLoading={deletingCat}
        onConfirm={handleConfirmDeleteCategory}
      />

      {/* Modifier Group Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(modGroupToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingModGroup) setModGroupToDelete(null);
        }}
        title={`Delete "${modGroupToDelete?.name || "this customization group"}"?`}
        description="This removes the customization options. Menu items linked to this group will remain on the menu without this modifier."
        confirmLabel="Delete Group"
        isDestructive={true}
        isLoading={deletingModGroup}
        onConfirm={handleDeleteModifierGroup}
      />

      {/* Add / Edit Modifier Group Modal */}
      {isModModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <form
            onSubmit={handleSaveModifierGroup}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            id="form-save-modifier-group"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-card shrink-0">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-bold text-foreground">
                  {editingModGroup ? "Edit Modifier Group" : "Create Modifier Group"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[calc(90vh-130px)]">
              {/* Group Name & Description */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Group Name *
                  </label>
                  <Input
                    required
                    value={modForm.name}
                    onChange={(e) => setModForm({ ...modForm, name: e.target.value })}
                    placeholder="e.g. Spice Level, Crust & Size, Beverage Milks"
                    className="mt-1 text-xs rounded-xl"
                    id="input-mod-group-name"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Customer Prompt / Description (Optional)
                  </label>
                  <Input
                    value={modForm.description}
                    onChange={(e) => setModForm({ ...modForm, description: e.target.value })}
                    placeholder="e.g. Choose your preferred heat level"
                    className="mt-1 text-xs rounded-xl"
                    id="input-mod-group-desc"
                  />
                </div>
              </div>

              {/* Selection Rule & Requirement */}
              <div className="rounded-xl border border-border/70 bg-secondary/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Selection Type
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModForm({ ...modForm, selectionType: "single", maxSelections: 1 })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                        modForm.selectionType === "single"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "bg-background border border-border text-muted-foreground"
                      }`}
                    >
                      Single Choice (Radio)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModForm({ ...modForm, selectionType: "multiple", maxSelections: 5 })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                        modForm.selectionType === "multiple"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "bg-background border border-border text-muted-foreground"
                      }`}
                    >
                      Multi-Select (Checkboxes)
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="checkbox-mod-required"
                      checked={modForm.required}
                      onChange={(e) =>
                        setModForm({
                          ...modForm,
                          required: e.target.checked,
                          minSelections: e.target.checked ? Math.max(1, modForm.minSelections) : 0,
                        })
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="checkbox-mod-required" className="text-xs font-medium cursor-pointer">
                      Required (customer must choose at least one)
                    </label>
                  </div>
                  {modForm.selectionType === "multiple" && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Max:</span>
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={modForm.maxSelections}
                        onChange={(e) =>
                          setModForm({ ...modForm, maxSelections: Math.max(1, Number(e.target.value)) })
                        }
                        className="h-7 w-14 rounded-lg text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Options Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Customization Options &amp; Extra Charges
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Price in {currency} (0 = Free)
                  </span>
                </div>

                <div className="space-y-2">
                  {modForm.options.map((opt, idx) => (
                    <div
                      key={opt.id || idx}
                      className="flex items-center gap-2 p-2 rounded-xl border border-border/80 bg-background"
                    >
                      <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">
                        {idx + 1}
                      </span>
                      <Input
                        required
                        value={opt.name}
                        onChange={(e) => {
                          const updated = [...modForm.options];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setModForm({ ...modForm, options: updated });
                        }}
                        placeholder="Option name (e.g. Extra Cheese)"
                        className="h-8 text-xs rounded-lg flex-1"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground font-mono">+₹</span>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={opt.priceAdjustment}
                          onChange={(e) => {
                            const updated = [...modForm.options];
                            updated[idx] = {
                              ...updated[idx],
                              priceAdjustment: Math.max(0, Number(e.target.value)),
                            };
                            setModForm({ ...modForm, options: updated });
                          }}
                          className="h-8 w-18 text-xs font-mono rounded-lg text-right"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (modForm.options.length <= 1) {
                            toast({ variant: "destructive", title: "At least 1 option is required" });
                            return;
                          }
                          const updated = modForm.options.filter((_, i) => i !== idx);
                          setModForm({ ...modForm, options: updated });
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Remove option"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setModForm({
                      ...modForm,
                      options: [
                        ...modForm.options,
                        {
                          id: `opt_${Date.now()}_${modForm.options.length + 1}`,
                          name: "",
                          priceAdjustment: 0,
                          available: true,
                          isDefault: false,
                        },
                      ],
                    });
                  }}
                  className="w-full h-8 text-xs rounded-xl border-dashed"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Another Option
                </Button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-3.5 bg-card shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingModGroup}
                className="rounded-xl text-xs font-semibold"
                id="button-submit-mod-group"
              >
                {savingModGroup ? "Saving…" : editingModGroup ? "Update Group" : "Save Group"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Large Menu Import Modal */}
      <MenuImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        slug={slug}
        currency={currency}
        existingCategories={categories}
        existingMenuItems={menuItems}
        currentPlan={currentPlan}
        onUpgrade={onUpgrade}
        onImportComplete={() => {
          refresh();
        }}
      />
    </div>
  );
}
