declare module "@/components/ui/button" {
  import * as React from "react";
  export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    asChild?: boolean;
    className?: string;
    children?: React.ReactNode;
  };
  export const Button: React.ComponentType<ButtonProps>;
  export const buttonVariants: (...args: any[]) => string;
}

declare module "@/components/ui/card" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Card: React.ComponentType<AnyProps>;
  export const CardHeader: React.ComponentType<AnyProps>;
  export const CardFooter: React.ComponentType<AnyProps>;
  export const CardTitle: React.ComponentType<AnyProps>;
  export const CardDescription: React.ComponentType<AnyProps>;
  export const CardContent: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/badge" {
  import * as React from "react";
  export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
    variant?: string;
    className?: string;
    children?: React.ReactNode;
  };
  export const Badge: React.ComponentType<BadgeProps>;
  export const badgeVariants: (...args: any[]) => string;
}

declare module "@/components/ui/input" {
  import * as React from "react";
  export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    className?: string;
    children?: React.ReactNode;
  };
  export const Input: React.ComponentType<InputProps>;
}

declare module "@/components/ui/progress" {
  import * as React from "react";
  export type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
    value?: number;
    className?: string;
    children?: React.ReactNode;
  };
  export const Progress: React.ComponentType<ProgressProps>;
}

declare module "@/components/ui/dialog" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Dialog: React.ComponentType<AnyProps>;
  export const DialogPortal: React.ComponentType<AnyProps>;
  export const DialogOverlay: React.ComponentType<AnyProps>;
  export const DialogTrigger: React.ComponentType<AnyProps>;
  export const DialogClose: React.ComponentType<AnyProps>;
  export const DialogContent: React.ComponentType<AnyProps>;
  export const DialogHeader: React.ComponentType<AnyProps>;
  export const DialogFooter: React.ComponentType<AnyProps>;
  export const DialogTitle: React.ComponentType<AnyProps>;
  export const DialogDescription: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/tabs" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Tabs: React.ComponentType<AnyProps>;
  export const TabsList: React.ComponentType<AnyProps>;
  export const TabsTrigger: React.ComponentType<AnyProps>;
  export const TabsContent: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/select" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; value?: any; [key: string]: any };
  export const Select: React.ComponentType<AnyProps>;
  export const SelectGroup: React.ComponentType<AnyProps>;
  export const SelectValue: React.ComponentType<AnyProps>;
  export const SelectTrigger: React.ComponentType<AnyProps>;
  export const SelectContent: React.ComponentType<AnyProps>;
  export const SelectLabel: React.ComponentType<AnyProps>;
  export const SelectItem: React.ComponentType<AnyProps>;
  export const SelectSeparator: React.ComponentType<AnyProps>;
  export const SelectScrollUpButton: React.ComponentType<AnyProps>;
  export const SelectScrollDownButton: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/command-card" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const CommandCard: React.ComponentType<AnyProps>;
  export const CommandCardHeader: React.ComponentType<AnyProps>;
  export const CommandCardTitle: React.ComponentType<AnyProps>;
  export const CommandCardDescription: React.ComponentType<AnyProps>;
  export const CommandCardContent: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/alert" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Alert: React.ComponentType<AnyProps>;
  export const AlertTitle: React.ComponentType<AnyProps>;
  export const AlertDescription: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/alert-dialog" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const AlertDialog: React.ComponentType<AnyProps>;
  export const AlertDialogTrigger: React.ComponentType<AnyProps>;
  export const AlertDialogPortal: React.ComponentType<AnyProps>;
  export const AlertDialogOverlay: React.ComponentType<AnyProps>;
  export const AlertDialogContent: React.ComponentType<AnyProps>;
  export const AlertDialogHeader: React.ComponentType<AnyProps>;
  export const AlertDialogFooter: React.ComponentType<AnyProps>;
  export const AlertDialogTitle: React.ComponentType<AnyProps>;
  export const AlertDialogDescription: React.ComponentType<AnyProps>;
  export const AlertDialogAction: React.ComponentType<AnyProps>;
  export const AlertDialogCancel: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/calendar" {
  import * as React from "react";
  export const Calendar: React.ComponentType<any>;
}

declare module "@/components/ui/checkbox" {
  import * as React from "react";
  export const Checkbox: React.ComponentType<any>;
}

declare module "@/components/ui/dropdown-menu" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const DropdownMenu: React.ComponentType<AnyProps>;
  export const DropdownMenuTrigger: React.ComponentType<AnyProps>;
  export const DropdownMenuContent: React.ComponentType<AnyProps>;
  export const DropdownMenuItem: React.ComponentType<AnyProps>;
  export const DropdownMenuCheckboxItem: React.ComponentType<AnyProps>;
  export const DropdownMenuRadioGroup: React.ComponentType<AnyProps>;
  export const DropdownMenuRadioItem: React.ComponentType<AnyProps>;
  export const DropdownMenuLabel: React.ComponentType<AnyProps>;
  export const DropdownMenuSeparator: React.ComponentType<AnyProps>;
  export const DropdownMenuShortcut: React.ComponentType<AnyProps>;
  export const DropdownMenuGroup: React.ComponentType<AnyProps>;
  export const DropdownMenuPortal: React.ComponentType<AnyProps>;
  export const DropdownMenuSub: React.ComponentType<AnyProps>;
  export const DropdownMenuSubContent: React.ComponentType<AnyProps>;
  export const DropdownMenuSubTrigger: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/label" {
  import * as React from "react";
  export const Label: React.ComponentType<any>;
}

declare module "@/components/ui/popover" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Popover: React.ComponentType<AnyProps>;
  export const PopoverTrigger: React.ComponentType<AnyProps>;
  export const PopoverContent: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/scroll-area" {
  import * as React from "react";
  export const ScrollArea: React.ComponentType<any>;
  export const ScrollBar: React.ComponentType<any>;
}

declare module "@/components/ui/separator" {
  import * as React from "react";
  export const Separator: React.ComponentType<any>;
}

declare module "@/components/ui/sheet" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Sheet: React.ComponentType<AnyProps>;
  export const SheetPortal: React.ComponentType<AnyProps>;
  export const SheetOverlay: React.ComponentType<AnyProps>;
  export const SheetTrigger: React.ComponentType<AnyProps>;
  export const SheetClose: React.ComponentType<AnyProps>;
  export const SheetContent: React.ComponentType<AnyProps>;
  export const SheetHeader: React.ComponentType<AnyProps>;
  export const SheetFooter: React.ComponentType<AnyProps>;
  export const SheetTitle: React.ComponentType<AnyProps>;
  export const SheetDescription: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/skeleton" {
  import * as React from "react";
  export const Skeleton: React.ComponentType<any>;
}

declare module "@/components/ui/switch" {
  import * as React from "react";
  export const Switch: React.ComponentType<any>;
}

declare module "@/components/ui/table" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const Table: React.ComponentType<AnyProps>;
  export const TableHeader: React.ComponentType<AnyProps>;
  export const TableBody: React.ComponentType<AnyProps>;
  export const TableFooter: React.ComponentType<AnyProps>;
  export const TableHead: React.ComponentType<AnyProps>;
  export const TableRow: React.ComponentType<AnyProps>;
  export const TableCell: React.ComponentType<AnyProps>;
  export const TableCaption: React.ComponentType<AnyProps>;
}

declare module "@/components/ui/textarea" {
  import * as React from "react";
  export const Textarea: React.ComponentType<any>;
}

declare module "@/components/ui/tooltip" {
  import * as React from "react";
  type AnyProps = { className?: string; children?: React.ReactNode; [key: string]: any };
  export const TooltipProvider: React.ComponentType<AnyProps>;
  export const Tooltip: React.ComponentType<AnyProps>;
  export const TooltipTrigger: React.ComponentType<AnyProps>;
  export const TooltipContent: React.ComponentType<AnyProps>;
}
