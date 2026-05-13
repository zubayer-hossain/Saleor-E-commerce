import { type OrderFragment, useOrderQuery } from "@/checkout/graphql";
import { getQueryParams } from "@/checkout/lib/utils/url";
import { readSaleorLanguageCodeFromDocumentCookie } from "@/lib/saleor-language-cookie";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export const useOrder = () => {
	const searchParams = useSearchParams();
	const { orderId } = getQueryParams(searchParams);
	const languageCode = useMemo(() => readSaleorLanguageCodeFromDocumentCookie(), []);

	const [{ data, fetching: loading }] = useOrderQuery({
		pause: !orderId,
		variables: { languageCode, id: orderId as string },
	});

	return { order: data?.order as OrderFragment, loading };
};
