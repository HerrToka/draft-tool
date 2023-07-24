import Image from 'next/image'
import styles from './page.module.css'

import Link from 'next/link'
import Logo from './components/logo/logo'


export default function Home() {
  return (
    <div className={styles.homepageWrapper}>
      <Logo></Logo>
      <h1 className={styles.heading}>Predecessor - Custom Drafts</h1>
      <p className={styles.text}>Use this Draft-System for Picks, Bans, and Trades to streamline your custom games!</p>
      <div className={styles.btnContainer}>
        <Link href="/create" className={styles.btn}>create</Link>
        <Link href="/join" className={styles.btn}>join</Link>
      </div>
    </div>
  )
}
