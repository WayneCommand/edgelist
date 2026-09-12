import { useCallback, useState, type ReactNode } from "react";
import { Button as HeroButton } from "@heroui/react";
import { ConfirmContext, type ConfirmFn, type ConfirmRequest } from "../../hooks/useConfirm";
import { useT } from "../../hooks/useLocale";
import { Modal } from "./Modal";

type PendingConfirm = ConfirmRequest & { resolve: (confirmed: boolean) => void };

/** Hosts the single confirmation dialog for the whole app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
	const t = useT();
	const [pending, setPending] = useState<PendingConfirm | null>(null);

	const confirm = useCallback<ConfirmFn>(
		(request) => new Promise<boolean>((resolve) => setPending({ ...request, resolve })),
		[],
	);

	function settle(confirmed: boolean) {
		pending?.resolve(confirmed);
		setPending(null);
	}

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			{pending && (
				<Modal title={pending.title} onClose={() => settle(false)}>
					<div className="space-y-5">
						<p className="text-sm text-muted">{pending.message}</p>
						<div className="flex justify-end gap-2">
							<HeroButton size="sm" variant="ghost" onPress={() => settle(false)}>
								{t("action.cancel")}
							</HeroButton>
							<HeroButton
								size="sm"
								variant={pending.danger === false ? "primary" : "danger"}
								onPress={() => settle(true)}
							>
								{pending.confirmLabel ?? t("action.delete")}
							</HeroButton>
						</div>
					</div>
				</Modal>
			)}
		</ConfirmContext.Provider>
	);
}
