import Image from 'next/image'
import styles from './preDraft.module.css'

import Link from 'next/link'
import Logo from '../components/logo/logo'

export default function PreDraft () {
    return (
        <div className={styles.preDraftWrapper}>
            <Logo></Logo>
            <h2 className={styles.heading}>Pick your Team and Role</h2>
            <div className={styles.roleContainer}>

            </div>
            <div className={styles.btnContainer}>
                <Link href="/draft" className={styles.btn}>Team 1</Link>
                <Link href="/draft" className={styles.btn}>Team 2</Link>
            </div>
            <div className={styles.counterContainer}>
                <p className={styles.counter}>2/10</p>
                <p className={styles.counterText}>Players joined...</p>
            </div>
        </div>
    )
}