import Link from 'next/link';

import Logo from '@/components/icons/Logo';
import GitHub from '@/components/icons/GitHub';
import Image from 'next/image';
export default function Footer() {
  return (
    <footer className="mx-auto max-w-[1920px] px-6 bg-white position: absolute; bottom: 0; left: 0; right: 0;">
      <div className="grid grid-cols-1 gap-8 py-12 text-gray-700 transition-colors duration-150 border-b border-gray-200 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-2">
          <Link
            href="/"
            className="flex items-center flex-initial font-bold md:mr-24"
          >
            <span className="mr-2">
              {/* <Logo /> */}
              <Image
                // center 
                className="mx-auto"
                src="/logo.png" alt="neurosity" width="64" height="64"
              />
            </span>
            <span>Mediar</span>
          </Link>
        </div>

        {/* <div className="col-span-1 lg:col-span-2">
          <ul className="flex flex-col flex-initial md:flex-1">
            <li className="py-3 md:py-0 md:pb-4">
              <Link
                href="/"
                className="text-gray-700 transition duration-150 ease-in-out hover:text-gray-900"
              >
                Home
              </Link>
            </li>
          </ul>
        </div> */}

        <div className="col-span-1 lg:col-span-2 jutify-end items-end">
          <ul className="flex flex-col flex-initial md:flex-1">
            <li className="py-3 md:py-0 md:pb-4">
              <Link
                href="/privacy"
                className="text-gray-700 transition duration-150 ease-in-out hover:text-gray-900"
              >
                Privacy Policy
              </Link>
            </li>
            {/* <li className="py-3 md:py-0 md:pb-4">
              <Link
                href="/"
                className="text-gray-700 transition duration-150 ease-in-out hover:text-gray-900"
              >
                Terms of Use
              </Link>
            </li> */}
          </ul>
        </div>

      </div>

      <div className="flex flex-col items-center justify-between py-12 space-y-4 md:flex-row text-gray-700">
        <div>
          <span>
            &copy; {new Date().getFullYear()} Mediar, Inc. All rights reserved.
            <br />
            <Link
              href="https://louis030195.com"
              className="transition duration-150 ease-in-out hover:text-gray-900"
            >
              🔨 louis030195
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}