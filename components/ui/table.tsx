import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Cada linha do corpo virou uma barra arredondada, separada da próxima —
 * mesma linguagem visual do "ConversationItem" documentado em
 * `app/design` (raio, borda, hover), agora ligada às tabelas de verdade.
 * As colunas continuam as mesmas de antes; só a moldura de cada linha mudou.
 *
 * Como funciona com `<table>` nativo: `border-radius` em `<tr>` não é
 * confiável entre navegadores, então quem desenha a "pílula" são as células
 * (`TableRow` estiliza os `<td>` filhos via seletor) — a primeira e a última
 * de cada linha arredondam sua ponta, as do meio ficam sem borda lateral, e
 * o espaço ENTRE linhas vem do `border-spacing` da própria `<table>`.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn(
        "w-full caption-bottom text-sm border-separate border-spacing-x-0 border-spacing-y-[var(--density-gap)]",
        className
      )}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={className} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />)
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("font-medium [&>tr>td]:bg-transparent", className)}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors",
      // A pílula: todo <td> filho ganha a mesma borda/fundo; só a ponta
      // (primeira/última célula) arredonda, pra virarem uma barra só.
      "[&>td]:border-y [&>td]:border-border [&>td]:bg-surface [&>td]:transition-colors",
      "[&>td:first-child]:border-l [&>td:first-child]:rounded-l-md",
      "[&>td:last-child]:border-r [&>td:last-child]:rounded-r-md",
      "hover:[&>td]:bg-surface-elevated hover:[&>td]:border-accent",
      "data-[state=selected]:[&>td]:bg-accent-soft data-[state=selected]:[&>td]:border-accent",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 border-b border-border px-[var(--density-px)] text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "py-[var(--density-py)] px-[var(--density-px)] align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
