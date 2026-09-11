import type { ReactNode } from "react";
import { Modal as HeroModal } from "@heroui/react";

type ModalProps = {
	title: string;
	children: ReactNode;
	onClose: () => void;
	wide?: boolean;
};

export function Modal({ title, children, onClose, wide = false }: ModalProps) {
	return (
		<HeroModal>
			<HeroModal.Backdrop
				isOpen
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
			>
				<HeroModal.Container size={wide ? "lg" : "sm"}>
					<HeroModal.Dialog>
						<HeroModal.CloseTrigger />
						<HeroModal.Header>
							<HeroModal.Heading>{title}</HeroModal.Heading>
						</HeroModal.Header>
						<HeroModal.Body>{children}</HeroModal.Body>
					</HeroModal.Dialog>
				</HeroModal.Container>
			</HeroModal.Backdrop>
		</HeroModal>
	);
}
