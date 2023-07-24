import Link from 'next/link'
import Image from 'next/image'
import styles from './logo.module.css'
import logo from '../../../assets/logo.png'

export default function Logo () {
    return (
        <Link href="/"><Image height='260' width='260' alt='Pred-Drafts Logo' src={logo}></Image></Link>
    )
}