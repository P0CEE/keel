"use client";

import { useRouter } from "next/navigation";

import { dayPart, firstName, hourIn } from "./figures";
import styles from "./home-view.module.css";
import { useHousehold } from "@/components/settings/queries";
import { useSession } from "@/lib/auth-client";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/mint/button";
import {
  ActivityIcon,
  AddIcon,
  BudgetIcon,
  ChevronDownIcon,
} from "@keel/ui/mint/icons";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@keel/ui/mint/menu";

/**
 * The home's first line, as Wealthsimple's desktop home: the greeting by
 * the household's hour and the member's first name, and on the right the
 * two pills, "Add" (a menu: an entry, a budget) and "Add an account". The
 * phone keeps its top bar and tab bar for these, so only the desk shows it.
 */
export function HomeHeader() {
  const t = useScopedI18n("home");
  const router = useRouter();
  const { data: session } = useSession();
  const timezone = useHousehold().data?.timezone ?? "UTC";
  const part = dayPart(hourIn(timezone, new Date()));
  const name = firstName(session?.user.name ?? session?.user.email ?? "");
  return (
    <header className={styles.header}>
      <h1 className={styles.greeting}>
        {name === ""
          ? t(`greeting_${part}_anonymous`)
          : t(`greeting_${part}`, { name })}
      </h1>
      <div className={styles.actions}>
        <MenuRoot>
          <MenuTrigger
            render={<Button variant="secondary" className={styles.pill} />}
          >
            {t("add")}
            <ChevronDownIcon size={12} />
          </MenuTrigger>
          <MenuPopup>
            <MenuItem
              icon={<ActivityIcon size={20} />}
              onClick={() => router.push("/activity?new=1")}
            >
              {t("add_entry")}
            </MenuItem>
            <MenuItem
              icon={<BudgetIcon size={20} />}
              onClick={() => router.push("/analysis/budgets")}
            >
              {t("add_budget")}
            </MenuItem>
          </MenuPopup>
        </MenuRoot>
        <Button
          variant="secondary"
          className={styles.pill}
          onClick={() => router.push("/accounts?connect=bank")}
        >
          <AddIcon size={18} />
          {t("add_account")}
        </Button>
      </div>
    </header>
  );
}
