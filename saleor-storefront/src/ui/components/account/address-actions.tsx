"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/ui/tooltip";
import { deleteAddress, setDefaultAddress } from "@/app/[channel]/(main)/account/actions";

type DeleteProps = {
	addressId: string;
};

export function DeleteAddressButton({ addressId }: DeleteProps) {
	const [isPending, startTransition] = useTransition();
	const [showConfirm, setShowConfirm] = useState(false);

	function handleDelete() {
		startTransition(async () => {
			const formData = new FormData();
			formData.set("id", addressId);
			const result = await deleteAddress(formData);
			if (result.success) {
				toast.success("Address removed.");
				setShowConfirm(false);
			} else {
				toast.error(result.error);
			}
		});
	}

	if (showConfirm) {
		return (
			<div className="flex items-center gap-1">
				<Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
					{isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Delete"}
				</Button>
				<Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)} disabled={isPending}>
					Cancel
				</Button>
			</div>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setShowConfirm(true)}
					disabled={isPending}
					aria-label="Delete this address"
				>
					<Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<p className="font-medium">Remove address</p>
				<p className="mt-1 text-xs opacity-90">Permanently delete this saved address.</p>
			</TooltipContent>
		</Tooltip>
	);
}

type SetDefaultProps = {
	addressId: string;
	type: "SHIPPING" | "BILLING";
};

export function SetDefaultAddressButton({ addressId, type }: SetDefaultProps) {
	const [isPending, startTransition] = useTransition();

	const kindLabel = type === "SHIPPING" ? "shipping" : "billing";
	const tooltipTitle = type === "SHIPPING" ? "Make default shipping" : "Make default billing";
	const tooltipHint =
		type === "SHIPPING"
			? "Checkout will suggest this address first for deliveries."
			: "Used as your primary billing address on orders and receipts.";

	function handleSetDefault() {
		startTransition(async () => {
			const formData = new FormData();
			formData.set("id", addressId);
			formData.set("type", type);
			const result = await setDefaultAddress(formData);
			if (result.success) {
				toast.success(
					type === "SHIPPING"
						? "Default shipping address updated."
						: "Default billing address updated.",
				);
			} else {
				toast.error(result.error);
			}
		});
	}

	const ariaLabel =
		type === "SHIPPING" ? "Set as default shipping address" : "Set as default billing address";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleSetDefault}
					disabled={isPending}
					aria-label={ariaLabel}
				>
					{isPending ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
					) : (
						<Star className="h-3.5 w-3.5 text-muted-foreground" aria-hidden strokeWidth={2} />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="max-w-[260px]">
				<p className="font-medium">{tooltipTitle}</p>
				<p className="mt-1 text-xs opacity-90">{tooltipHint}</p>
				<p className="mt-2 border-t border-border pt-2 text-[11px] opacity-75">
					Star marks which address is used as your default {kindLabel}.
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
