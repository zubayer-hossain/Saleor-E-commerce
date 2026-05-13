import { ProductElement } from "./product-element";
import { type ProductListItemFragment } from "@/gql/graphql";
import { cn } from "@/lib/utils";

export const ProductList = ({
	products,
	className,
}: {
	products: readonly ProductListItemFragment[];
	className?: string;
}) => {
	return (
		<ul
			role="list"
			data-testid="ProductList"
			className={cn("grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3", className)}
		>
			{products.map((product, index) => (
				<ProductElement
					key={product.id}
					product={product}
					priority={index < 2}
					loading={index < 3 ? "eager" : "lazy"}
				/>
			))}
		</ul>
	);
};
